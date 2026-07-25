// FastPath - The mask's text template, with variables shown as coloured chips
// instead of raw {{placeholders}}.
//
// The template is stored as a plain string with {{Name}} placeholders. This
// component renders it into a contenteditable surface where each placeholder is
// an atomic, non-editable chip, and serialises the surface back to that string
// on every edit. Typing, Enter and paste are constrained to plain text so the
// DOM never grows structure the serialiser cannot represent.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { PLACEHOLDER_PATTERN, normalizeMaskVariableName } from "@/lib/maskExecutor";

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

/** Render the stored template string into chips + text. */
export function toHtml(template: string, knownNames: Set<string>): string {
  let html = "";
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const at = match.index ?? 0;
    if (at > last) html += escapeHtml(template.slice(last, at));
    const name = normalizeMaskVariableName(match[1]);
    html += chipHtml(name, knownNames.has(name));
    last = at + match[0].length;
  }
  if (last < template.length) html += escapeHtml(template.slice(last));
  return html;
}

/** Serialise the editing surface back into the stored template string. */
export function serialize(root: HTMLElement): string {
  let out = "";

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;

      const varName = child.dataset.var;
      if (varName) {
        out += `{{${varName}}}`;
        continue;
      }
      if (child.tagName === "BR") {
        out += "\n";
        continue;
      }
      // Browsers may wrap lines in block elements when editing; treat the
      // start of each one as a line break.
      if (child.tagName === "DIV" || child.tagName === "P") {
        if (out !== "" && !out.endsWith("\n")) out += "\n";
        walk(child);
        continue;
      }
      walk(child);
    }
  };

  walk(root);
  // A trailing <br> is how browsers keep the last line focusable; it is not
  // part of the text the user typed.
  return out.endsWith("\n") && root.lastChild instanceof HTMLBRElement
    ? out.slice(0, -1)
    : out;
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
