// FastPath - The mask's text template, with variables shown as coloured chips
// instead of raw {{placeholders}}.
//
// The template is stored as a plain string with {{Name}} placeholders. This
// component renders it into a contenteditable surface where each placeholder is
// an atomic, non-editable chip, and serialises the surface back to that string
// on every edit. Typing, Enter and paste are constrained to plain text so the
// DOM never grows structure the serialiser cannot represent.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  BOLD_MARKER,
  ITALIC_MARKER,
  placeholderPattern,
  normalizeMaskVariableName,
} from "@/lib/maskExecutor";
import { useMaskStore } from "@/hooks/useMaskStore";
import { t } from "@/lib/i18n";

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
    `<span data-var="${escapeHtml(name)}" contenteditable="false" draggable="true" ` +
    `style="${CHIP_BASE};${chipStyleFor(name, known)}" ` +
    `title="${escapeHtml(chipLabel(name))}">${escapeHtml(chipLabel(name))}</span>`
  );
}

/**
 * Drag payload marking "this is an existing chip being relocated within the
 * template", distinct from the plain-text token drag the field list in
 * MaskEditorModal uses to insert a fresh chip — dropping that should still
 * insert a copy, not move anything.
 */
const CHIP_MOVE_MIME = "application/x-fastpath-chip-move";

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

const BOLD_TAGS = ["STRONG", "B"];
const ITALIC_TAGS = ["EM", "I"];

/** Whether `chip` has a bold/italic ancestor (stopping at `host`). */
function chipFormatting(chip: HTMLElement, host: HTMLElement): { bold: boolean; italic: boolean } {
  let bold = false;
  let italic = false;
  for (let el = chip.parentElement; el && el !== host; el = el.parentElement) {
    const own = elementFormatting(el);
    bold = bold || own.bold;
    italic = italic || own.italic;
  }
  return { bold, italic };
}

/** Wrap `chip` in a new bold/italic element, right where it already sits. */
function wrapChip(chip: HTMLElement, tag: "strong" | "em") {
  const wrapper = document.createElement(tag);
  chip.replaceWith(wrapper);
  wrapper.appendChild(chip);
}

/**
 * Undo `wrapChip`: find the nearest bold/italic ancestor that wraps nothing
 * but this chip, and remove it. An ancestor shared with other content is left
 * alone — that shouldn't happen (chips only ever get a wrapper of their own
 * from `wrapChip`), but corrupting sibling formatting would be worse than a
 * chip that stays formatted.
 */
function unwrapChip(chip: HTMLElement, host: HTMLElement, tags: string[]) {
  for (let el = chip.parentElement; el && el !== host; el = el.parentElement) {
    if (tags.includes(el.tagName)) {
      if (el.childNodes.length === 1) el.replaceWith(el.firstChild as ChildNode);
      return;
    }
  }
}

/**
 * The node to actually relocate when dragging `chip`: itself, or the
 * outermost bold/italic wrapper `wrapChip` gave it exclusively, so the chip's
 * own formatting travels with it. A wrapper shared with other text is left
 * behind wrapping whatever it still contains.
 */
export function chipMoveRoot(chip: HTMLElement, host: HTMLElement): HTMLElement {
  let node: HTMLElement = chip;
  while (node.parentElement && node.parentElement !== host) {
    const parent = node.parentElement;
    const isExclusiveWrapper =
      (BOLD_TAGS.includes(parent.tagName) || ITALIC_TAGS.includes(parent.tagName)) &&
      parent.childNodes.length === 1;
    if (!isExclusiveWrapper) break;
    node = parent;
  }
  return node;
}

/**
 * The chip alone, when `range` selects it and nothing else — the shape a
 * click on an atomic `contenteditable="false"` node produces (its parent as
 * both start/end container, offsets bracketing just that one child). `null`
 * for any other selection, including one that also covers surrounding text.
 */
export function getSelectedChipOnly(host: HTMLElement, range: Range): HTMLElement | null {
  if (range.collapsed) return null;
  if (range.startContainer !== range.endContainer) return null;
  if (range.endOffset - range.startOffset !== 1) return null;
  const container = range.startContainer;
  if (!(container instanceof HTMLElement) || !host.contains(container)) return null;
  const node = container.childNodes[range.startOffset];
  return node instanceof HTMLElement && node.dataset.var !== undefined ? node : null;
}

/**
 * `execCommand` treats a variable chip (`contenteditable="false"`) as opaque
 * and skips it: selecting "text {{var}} text" and toggling bold wraps the
 * text on either side but leaves the chip bare. Fix up every chip that was
 * inside `range` so it ends up matching what the surrounding text just
 * became, instead of silently sitting out the formatting it was selected
 * for.
 */
export function fixChipFormatting(
  host: HTMLElement,
  chips: HTMLElement[],
  format: "bold" | "italic",
  turningOn: boolean,
): void {
  const tags = format === "bold" ? BOLD_TAGS : ITALIC_TAGS;
  for (const chip of chips) {
    if (!host.contains(chip)) continue; // execCommand rebuilt this node
    const isFormatted = chipFormatting(chip, host)[format];
    if (isFormatted === turningOn) continue;
    if (turningOn) wrapChip(chip, format === "bold" ? "strong" : "em");
    else unwrapChip(chip, host, tags);
  }
}

/**
 * The bold/italic state the toolbar should show. `document.queryCommandState`
 * only knows about editable text, so it reports nothing useful when the
 * selection is a lone chip (an atomic, non-editable node) — read the chip's
 * own formatting directly for that case instead.
 */
function computeActive(host: HTMLElement): { bold: boolean; italic: boolean } {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const chip = range ? getSelectedChipOnly(host, range) : null;
  if (chip) return chipFormatting(chip, host);
  return {
    bold: document.queryCommandState("bold"),
    italic: document.queryCommandState("italic"),
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
    const lang = useMaskStore((s) => s.settings.language);

    // The chip the author explicitly clicked, so a plain "B"/"I" press can
    // target it — kept as a ref (not React state) and mirrored onto the node
    // as a CSS class, independent of the browser's own selection, which is
    // unreliable for an atomic contenteditable="false" node in WebView2.
    const selectedChipRef = useRef<HTMLElement | null>(null);
    const setSelectedChip = (chip: HTMLElement | null) => {
      if (selectedChipRef.current === chip) return;
      selectedChipRef.current?.classList.remove("chip-selected");
      chip?.classList.add("chip-selected");
      selectedChipRef.current = chip;
    };

    // The node currently being drag-relocated within the template (see
    // chipMoveRoot) — set on dragstart, consumed on drop.
    const draggingNodeRef = useRef<HTMLElement | null>(null);

    // Whether the caret/selection is currently inside bold/italic text, so the
    // toolbar can show it instead of leaving formatting invisible until the
    // author notices the (subtle) weight difference in the rendered text.
    const [active, setActive] = useState({ bold: false, italic: false });
    const refreshActive = () => {
      const host = hostRef.current;
      if (!host) return;
      const chip = selectedChipRef.current;
      setActive(chip && host.contains(chip) ? chipFormatting(chip, host) : computeActive(host));
    };

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      if (rendered.current === value) return;
      host.innerHTML = toHtml(value, knownRef.current);
      rendered.current = value;
      // The old chip nodes just got replaced wholesale.
      selectedChipRef.current = null;
    }, [value, knownNames]);

    useEffect(() => {
      const syncActive = () => {
        const host = hostRef.current;
        if (!host || document.activeElement !== host) return;
        refreshActive();
      };
      document.addEventListener("selectionchange", syncActive);
      return () => document.removeEventListener("selectionchange", syncActive);
      // Only reads refs, which always see the latest value — safe to run once.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const commit = () => {
      const host = hostRef.current;
      if (!host) return;
      const next = serialize(host);
      rendered.current = next;
      onChange(next);
    };

    const toggleFormat = (format: "bold" | "italic") => {
      const host = hostRef.current;
      if (!host) return;

      // A chip the author explicitly clicked has no editable text for
      // execCommand to act on, so flip its own wrapper directly.
      const stickyChip =
        selectedChipRef.current && host.contains(selectedChipRef.current)
          ? selectedChipRef.current
          : null;
      if (stickyChip) {
        const turningOn = !chipFormatting(stickyChip, host)[format];
        fixChipFormatting(host, [stickyChip], format, turningOn);
        commit();
        refreshActive();
        return;
      }

      const selection = window.getSelection();
      const range =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      // Chip elements themselves aren't touched by execCommand (it skips
      // contenteditable="false" content), so grabbing them before the
      // command runs is enough — no need for the Range to stay valid after.
      const chipsInRange = range
        ? Array.from(host.querySelectorAll<HTMLElement>("[data-var]")).filter((chip) =>
            range.intersectsNode(chip),
          )
        : [];
      const turningOn = !active[format];

      host.focus();
      // Ask for tags rather than inline styles; serialize accepts both,
      // but tags keep the markup the template maps onto.
      document.execCommand("styleWithCSS", false, "false");
      document.execCommand(format);
      fixChipFormatting(host, chipsInRange, format, turningOn);
      commit();
      refreshActive();
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

    const toolbarButton = (format: "bold" | "italic", label: string) => (
      <button
        type="button"
        title={t(format === "bold" ? "editor.bold" : "editor.italic", lang)}
        aria-pressed={active[format]}
        // Keep focus (and the selection) on the editor; a default mousedown
        // would blur it before the click handler ever runs.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleFormat(format)}
        className={`flex h-6 w-6 items-center justify-center rounded-[6px] text-[13px] leading-none ${
          format === "bold" ? "font-extrabold" : "italic"
        } ${active[format] ? "bg-brand text-white" : "bg-sand text-ink"}`}
      >
        {label}
      </button>
    );

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1">
          {toolbarButton("bold", "B")}
          {toolbarButton("italic", "I")}
        </div>
        <div
          ref={hostRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          data-placeholder={placeholder}
          onInput={() => {
            // Any edit means the author has moved on from the clicked chip.
            setSelectedChip(null);
            commit();
          }}
          onFocus={refreshActive}
          onBlur={() => {
            commit();
            setSelectedChip(null);
            setActive({ bold: false, italic: false });
          }}
          onMouseDown={(e) => {
            // Track the clicked chip ourselves instead of leaning on the
            // browser's own selection around an atomic node, which WebView2
            // doesn't reliably keep — this is what makes a plain "B" press
            // target that one chip. Native click handling still runs (no
            // preventDefault), so caret placement and chip deletion are
            // unaffected.
            const host = hostRef.current;
            if (!host) return;
            const chip = (e.target as HTMLElement).closest?.("[data-var]") as HTMLElement | null;
            setSelectedChip(chip && host.contains(chip) ? chip : null);
            if (chip) setActive(chipFormatting(chip, host));
          }}
          onKeyDown={(e) => {
            // Keep the surface plain: Enter inserts a newline instead of letting
            // the browser create block elements.
            if (e.key === "Enter") {
              e.preventDefault();
              document.execCommand("insertText", false, "\n");
              setSelectedChip(null);
              return;
            }
            const key = e.key.toLowerCase();
            if (key === "b" || key === "i") {
              // Ctrl/Cmd+B(I) works anywhere; a clicked chip also takes the
              // plain key, both so it's quick and so typing "b" over a
              // selected chip doesn't fall through to deleting it.
              if (e.ctrlKey || e.metaKey || selectedChipRef.current) {
                e.preventDefault();
                toggleFormat(key === "b" ? "bold" : "italic");
                return;
              }
            }
            // Any other key means the author is done with the clicked chip.
            if (!e.ctrlKey && !e.metaKey) setSelectedChip(null);
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            if (text) document.execCommand("insertText", false, text);
          }}
          onDragStart={(e) => {
            const host = hostRef.current;
            const chip = (e.target as HTMLElement).closest?.("[data-var]") as HTMLElement | null;
            if (!host || !chip || !host.contains(chip)) return;
            e.dataTransfer.setData("text/plain", `{{${chip.dataset.var}}}`);
            e.dataTransfer.setData(CHIP_MOVE_MIME, "1");
            e.dataTransfer.effectAllowed = "move";
            draggingNodeRef.current = chipMoveRoot(chip, host);
            // Dragging is a different gesture from clicking to pick a
            // format target; don't leave the ring on afterwards.
            setSelectedChip(null);
          }}
          onDragEnd={() => {
            draggingNodeRef.current = null;
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const host = hostRef.current;
            const isChipMove = e.dataTransfer.types.includes(CHIP_MOVE_MIME);
            const movingNode = draggingNodeRef.current;
            draggingNodeRef.current = null;

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
            if (!range || !host?.contains(range.startContainer)) return;

            // Relocating a chip already in the template: move the captured
            // node (insertNode relocates rather than duplicates) instead of
            // inserting a fresh copy.
            if (isChipMove && movingNode && host.contains(movingNode)) {
              range.insertNode(movingNode);
              const after = document.createRange();
              after.setStartAfter(movingNode);
              after.collapse(true);
              const selection = window.getSelection();
              selection?.removeAllRanges();
              selection?.addRange(after);
              commit();
              return;
            }

            const dropped = e.dataTransfer.getData("text/plain");
            if (!dropped) return;
            const match = dropped.match(/^\s*\{\{\s*([\p{L}\p{N}_]+)\s*\}\}\s*$/u);
            if (match) {
              insertChipAt(range, normalizeMaskVariableName(match[1]));
              return;
            }
            range.deleteContents();
            range.insertNode(document.createTextNode(dropped));
            commit();
          }}
          className={`template-editor-surface ${className ?? ""}`}
        />
      </div>
    );
  },
);
