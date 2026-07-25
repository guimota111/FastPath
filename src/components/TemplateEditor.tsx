// FastPath - The mask's text template, with variables shown as coloured chips
// instead of raw {{placeholders}}.
//
// The template is stored as a plain string with {{Name}} placeholders. This
// component renders it into a contenteditable surface where each placeholder is
// an atomic, non-editable chip, and serialises the surface back to that string
// on every edit. Typing, Enter and paste are constrained to plain text so the
// DOM never grows structure the serialiser cannot represent.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  BOLD_MARKER,
  ITALIC_MARKER,
  placeholderPattern,
  normalizeMaskVariableName,
} from "@/lib/maskExecutor";

export interface TemplateEditorHandle {
  /** Insert `{{name}}` at the caret (or at the end if not focused). */
  insertVariable: (name: string) => void;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Field names that exist; anything else is flagged as unknown. */
  knownNames: string[];
  placeholder?: string;
  className?: string;
}

/** Chip palette — stable per variable name so a field keeps its colour. */
const CHIP_STYLES = [
  "background:#DCF5E6;color:#12764A;border-color:#B6E7CB",
  "background:#E4EEFF;color:#1B4F9C;border-color:#C3DAFB",
  "background:#FFE9D6;color:#9A5210;border-color:#FBD3AF",
  "background:#F0E6FF;color:#5B2CA0;border-color:#D9C6F7",
  "background:#FFE4F0;color:#9C1E5C;border-color:#F9C2DA",
  "background:#E2F4F7;color:#0F6070;border-color:#BEE6ED",
];
const UNKNOWN_CHIP_STYLE =
  "background:#FDE4E4;color:#A12222;border-color:#F6C2C2";

function chipStyleFor(name: string, known: boolean): string {
  if (!known) return UNKNOWN_CHIP_STYLE;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CHIP_STYLES[Math.abs(hash) % CHIP_STYLES.length];
}

const CHIP_BASE =
  "display:inline-block;border:1px solid;border-radius:8px;padding:1px 8px;" +
  "margin:0 1px;font-size:12.5px;font-weight:800;line-height:1.5;" +
  "white-space:nowrap;user-select:none;cursor:default";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Human-readable chip label: underscores read as spaces. */
function chipLabel(name: string): string {
  return name.replace(/_/g, " ");
}

function chipHtml(name: string, known: boolean): string {
  return (
    `<span data-var="${escapeHtml(name)}" contenteditable="false" ` +
    `style="${CHIP_BASE};${chipStyleFor(name, known)}" ` +
    `title="${escapeHtml(chipLabel(name))}">${escapeHtml(chipLabel(name))}</span>`
  );
}

/**
 * Render the stored template string into chips + text, with the bold/italic
 * markers turned into real `<strong>`/`<em>` so the author sees the formatting
 * instead of the markup.
 */
export function toHtml(template: string, knownNames: Set<string>): string {
  // Collect the pieces first so tags can be opened and closed only where the
  // formatting actually changes, leaving no empty elements for the caret to
  // get stuck in.
  const placeholder = placeholderPattern();
  const pieces: { html: string; bold: boolean; italic: boolean }[] = [];
  let bold = false;
  let italic = false;
  let i = 0;

  const push = (html: string) => {
    if (html === "") return;
    const last = pieces[pieces.length - 1];
    if (last && last.bold === bold && last.italic === italic) {
      last.html += html;
      return;
    }
    pieces.push({ html, bold, italic });
  };

  while (i < template.length) {
    if (template.startsWith(BOLD_MARKER, i)) {
      bold = !bold;
      i += BOLD_MARKER.length;
      continue;
    }
    if (template.startsWith(ITALIC_MARKER, i)) {
      italic = !italic;
      i += ITALIC_MARKER.length;
      continue;
    }

    placeholder.lastIndex = i;
    const match = placeholder.exec(template);
    if (match && match.index === i) {
      const name = normalizeMaskVariableName(match[1]);
      push(chipHtml(name, knownNames.has(name)));
      i += match[0].length;
      continue;
    }

    push(escapeHtml(template[i]));
    i += 1;
  }

  // Group by bold, then by italic within each group, so a bold stretch is one
  // element with the italic parts nested inside rather than a chain of
  // sibling <strong>s.
  let html = "";
  for (let start = 0; start < pieces.length; ) {
    const isBold = pieces[start].bold;
    let end = start;
    while (end < pieces.length && pieces[end].bold === isBold) end += 1;

    let inner = "";
    for (let j = start; j < end; ) {
      const isItalic = pieces[j].italic;
      let k = j;
      let text = "";
      while (k < end && pieces[k].italic === isItalic) {
        text += pieces[k].html;
        k += 1;
      }
      inner += isItalic ? `<em>${text}</em>` : text;
      j = k;
    }

    html += isBold ? `<strong>${inner}</strong>` : inner;
    start = end;
  }
  return html;
}

/** Whether an element turns bold or italic on for everything inside it. */
function elementFormatting(el: HTMLElement): { bold: boolean; italic: boolean } {
  const tag = el.tagName;
  const weight = el.style.fontWeight;
  const style = el.style.fontStyle;
  return {
    // execCommand may produce either tags or inline styles depending on the
    // browser and on styleWithCSS; accept both.
    bold: tag === "B" || tag === "STRONG" || weight === "bold" || Number(weight) >= 600,
    italic: tag === "I" || tag === "EM" || style === "italic",
  };
}

/**
 * Serialise the editing surface back into the stored template string, turning
 * bold/italic elements back into markers.
 */
export function serialize(root: HTMLElement): string {
  // Flatten to pieces first: emitting markers needs to see where formatting
  // changes, which nested elements obscure.
  const pieces: { text: string; bold: boolean; italic: boolean }[] = [];
  let sawTrailingBr = false;

  const walk = (node: Node, bold: boolean, italic: boolean) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        pieces.push({ text: child.textContent ?? "", bold, italic });
        sawTrailingBr = false;
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;

      const varName = child.dataset.var;
      if (varName) {
        pieces.push({ text: `{{${varName}}}`, bold, italic });
        sawTrailingBr = false;
        continue;
      }
      if (child.tagName === "BR") {
        pieces.push({ text: "\n", bold, italic });
        sawTrailingBr = child.parentNode === root && child === root.lastChild;
        continue;
      }
      // Browsers may wrap lines in block elements when editing; treat the
      // start of each one as a line break.
      if (child.tagName === "DIV" || child.tagName === "P") {
        const last = pieces[pieces.length - 1];
        if (pieces.length > 0 && !last.text.endsWith("\n")) {
          pieces.push({ text: "\n", bold, italic });
        }
        walk(child, bold, italic);
        sawTrailingBr = false;
        continue;
      }

      const own = elementFormatting(child);
      walk(child, bold || own.bold, italic || own.italic);
      sawTrailingBr = false;
    }
  };

  walk(root, false, false);
  // A trailing <br> is how browsers keep the last line focusable; it is not
  // part of the text the user typed.
  if (sawTrailingBr) pieces.pop();

  let out = "";
  let bold = false;
  let italic = false;
  for (const piece of pieces) {
    if (piece.text === "") continue;
    // Close italic before bold so the markers stay properly nested.
    if (italic && piece.italic !== italic) {
      out += ITALIC_MARKER;
      italic = false;
    }
    if (piece.bold !== bold) {
      out += BOLD_MARKER;
      bold = piece.bold;
    }
    if (piece.italic !== italic) {
      out += ITALIC_MARKER;
      italic = piece.italic;
    }
    out += piece.text;
  }
  if (italic) out += ITALIC_MARKER;
  if (bold) out += BOLD_MARKER;
  return out;
}

export const TemplateEditor = forwardRef<TemplateEditorHandle, Props>(
  function TemplateEditor({ value, onChange, knownNames, placeholder, className }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    // What the surface currently holds, so external updates can be told apart
    // from the user's own typing (re-rendering while typing kills the caret).
    const rendered = useRef<string | null>(null);
    const knownRef = useRef<Set<string>>(new Set());
    knownRef.current = new Set(knownNames.map(normalizeMaskVariableName));

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      if (rendered.current === value) return;
      host.innerHTML = toHtml(value, knownRef.current);
      rendered.current = value;
    }, [value, knownNames]);

    const commit = () => {
      const host = hostRef.current;
      if (!host) return;
      const next = serialize(host);
      rendered.current = next;
      onChange(next);
    };

    /** Insert a chip at `range`, leaving the caret right after it. */
    const insertChipAt = (range: Range, name: string) => {
      const host = hostRef.current;
      if (!host) return;
      range.deleteContents();

      const holder = document.createElement("div");
      holder.innerHTML = chipHtml(name, knownRef.current.has(name));
      const chip = holder.firstElementChild;
      if (!chip) return;
      range.insertNode(chip);

      const after = document.createRange();
      after.setStartAfter(chip);
      after.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(after);
      commit();
    };

    useImperativeHandle(ref, () => ({
      insertVariable(name) {
        const host = hostRef.current;
        if (!host) return;
        host.focus();
        const selection = window.getSelection();
        const inside =
          selection &&
          selection.rangeCount > 0 &&
          selection.anchorNode &&
          host.contains(selection.anchorNode);

        let range: Range;
        if (inside) {
          range = selection!.getRangeAt(0);
        } else {
          range = document.createRange();
          range.selectNodeContents(host);
          range.collapse(false);
        }
        insertChipAt(range, normalizeMaskVariableName(name));
      },
    }));

    return (
      <div
        ref={hostRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={commit}
        onBlur={commit}
        onKeyDown={(e) => {
          // Keep the surface plain: Enter inserts a newline instead of letting
          // the browser create block elements.
          if (e.key === "Enter") {
            e.preventDefault();
            document.execCommand("insertText", false, "\n");
            return;
          }
          const key = e.key.toLowerCase();
          if ((e.ctrlKey || e.metaKey) && (key === "b" || key === "i")) {
            e.preventDefault();
            // Ask for tags rather than inline styles; serialize accepts both,
            // but tags keep the markup the template maps onto.
            document.execCommand("styleWithCSS", false, "false");
            document.execCommand(key === "b" ? "bold" : "italic");
            commit();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          if (text) document.execCommand("insertText", false, text);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = e.dataTransfer.getData("text/plain");
          if (!dropped) return;

          // Drop lands where the pointer is, not where the caret was.
          const doc = document as Document & {
            caretRangeFromPoint?: (x: number, y: number) => Range | null;
          };
          const range =
            doc.caretRangeFromPoint?.(e.clientX, e.clientY) ??
            (() => {
              const r = document.createRange();
              if (hostRef.current) {
                r.selectNodeContents(hostRef.current);
                r.collapse(false);
              }
              return r;
            })();
          if (!range || !hostRef.current?.contains(range.startContainer)) return;

          const match = dropped.match(/^\s*\{\{\s*([\p{L}\p{N}_]+)\s*\}\}\s*$/u);
          if (match) {
            insertChipAt(range, normalizeMaskVariableName(match[1]));
            return;
          }
          range.deleteContents();
          range.insertNode(document.createTextNode(dropped));
          commit();
        }}
        className={className}
      />
    );
  },
);
