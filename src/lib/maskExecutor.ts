// FastPath - Core mask logic (framework-agnostic).
// Interpolation, validation, variable extraction and name normalization.

import type {
  Condition,
  FieldCondition,
  LineMode,
  Mask,
  MaskBlock,
  TextRun,
  VariableBlock,
} from "./types";
import { BASIC_MASK_LIMIT } from "./constants";
import type { Plan } from "./types";
import { maskQuota } from "./constants";

/** Replace runs of whitespace with "_" so variable names are stable keys. */
export function normalizeMaskVariableName(name: string): string {
  return name.trim().replace(/\s+/g, "_");
}

/** Walk the block tree and collect every (normalized) variable name, deduped. */
export function extractVariables(blocks: MaskBlock[]): string[] {
  const seen = new Set<string>();
  const visit = (bs: MaskBlock[]) => {
    for (const block of bs) {
      if (block.type === "variable") {
        const name = normalizeMaskVariableName(block.variable_name);
        if (name) seen.add(name);
      } else if (block.type === "conditional") {
        const condName = normalizeMaskVariableName(block.condition.variable_name);
        if (condName) seen.add(condName);
        visit(block.blocks);
      }
    }
  };
  visit(blocks);
  return [...seen];
}

/** `s` as a number, or null if it isn't one — an empty string is not a number. */
function parseNumeric(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function evaluateCondition(
  cond: Condition,
  variables: Record<string, string>,
): boolean {
  const key = normalizeMaskVariableName(cond.variable_name);
  const value = variables[key] ?? "";

  switch (cond.operator) {
    case "equals":
      return value === cond.value;
    case "contains":
      return value.includes(cond.value);
    case "gt":
    case "lt":
    case "gte":
    case "lte": {
      const actual = parseNumeric(value);
      const target = parseNumeric(cond.value);
      if (actual === null || target === null) return false;
      if (cond.operator === "gt") return actual > target;
      if (cond.operator === "lt") return actual < target;
      if (cond.operator === "gte") return actual >= target;
      return actual <= target;
    }
    default:
      return false;
  }
}

/**
 * Whether a `FieldCondition` currently holds: the source field's value
 * matches ANY of its listed values (OR) — an empty list never matches.
 */
function matchesFieldCondition(
  cond: FieldCondition,
  values: Record<string, string>,
): boolean {
  const { variable_name, operator, values: wanted } = cond;
  return wanted.some((value) => evaluateCondition({ variable_name, operator, value }, values));
}

/**
 * Whether a field should currently be shown, given its own visibility
 * condition (if any) evaluated against the other fields' present values.
 */
export function isFieldVisible(
  field: VariableBlock,
  values: Record<string, string>,
): boolean {
  return !field.condition || matchesFieldCondition(field.condition, values);
}

/**
 * The text a `computed` field resolves to: `checked_text` when
 * `computed_condition` holds, `unchecked_text` otherwise — the same shape as
 * a checkbox, just driven by another field's value instead of a user click.
 */
export function computedFieldValue(
  field: VariableBlock,
  values: Record<string, string>,
): string {
  if (!field.computed_condition) return "";
  return checkboxValue(field, matchesFieldCondition(field.computed_condition, values));
}

/**
 * Resolve the value for a variable block, falling back to its default, and
 * say whether that text is something the mask *author* wrote (default,
 * select option, checkbox/multicheck text) versus something the report
 * writer typed live into a `text`/`textarea` field.
 *
 * The distinction matters for `**`/`__` markers: authored text may contain
 * them on purpose (see `pushAuthoredText`), but a free-typed value is the
 * report writer's own words and must never have stray asterisks read back as
 * formatting.
 */
function resolveVariableValue(
  block: VariableBlock,
  variables: Record<string, string>,
): { text: string; authored: boolean } {
  const key = normalizeMaskVariableName(block.variable_name);
  const provided = variables[key];
  if (provided !== undefined && provided !== "") {
    return { text: provided, authored: block.field_type !== "text" && block.field_type !== "textarea" };
  }
  return { text: block.default ?? "", authored: true };
}

/**
 * Push authored text (a field's default, option or checkbox/multicheck
 * wording), splitting it on `**`/`__` markers the mask author may have typed
 * directly into that field's config. Markers only add emphasis on top of
 * `baseBold`/`baseItalic` — they cannot turn off formatting the surrounding
 * template already applied to the whole field.
 */
function pushAuthoredText(
  push: (text: string, bold: boolean, italic: boolean) => void,
  text: string,
  baseBold: boolean,
  baseItalic: boolean,
): void {
  let bold = false;
  let italic = false;
  let pending = "";
  let i = 0;

  const flush = () => {
    if (pending !== "") push(pending, baseBold || bold, baseItalic || italic);
    pending = "";
  };

  while (i < text.length) {
    if (text.startsWith(BOLD_MARKER, i)) {
      flush();
      bold = !bold;
      i += BOLD_MARKER.length;
      continue;
    }
    if (text.startsWith(ITALIC_MARKER, i)) {
      flush();
      italic = !italic;
      i += ITALIC_MARKER.length;
      continue;
    }
    pending += text[i];
    i += 1;
  }
  flush();
}

/**
 * Render the block tree into formatted runs. Adjacent stretches sharing the
 * same formatting are merged, so the result is the shortest run list that still
 * describes the report.
 */
export function renderRuns(
  blocks: MaskBlock[],
  variables: Record<string, string>,
): TextRun[] {
  const runs: TextRun[] = [];

  const push = (text: string, bold: boolean, italic: boolean) => {
    if (text === "") return;
    const last = runs[runs.length - 1];
    if (last && !!last.bold === bold && !!last.italic === italic) {
      last.text += text;
      return;
    }
    runs.push({ text, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}) });
  };

  /** Drop the line break the template reserved for an empty conditional field. */
  const dropTrailingNewline = () => {
    for (let i = runs.length - 1; i >= 0; i -= 1) {
      if (runs[i].text === "") continue;
      if (runs[i].text.endsWith("\n")) {
        runs[i].text = runs[i].text.slice(0, -1);
        if (runs[i].text === "") runs.splice(i, 1);
      }
      return;
    }
  };

  const visit = (bs: MaskBlock[]) => {
    for (const block of bs) {
      switch (block.type) {
        case "text":
          push(block.content, !!block.bold, !!block.italic);
          break;
        case "variable": {
          const { text: value, authored } = resolveVariableValue(block, variables);
          // A "conditional" field takes its line break from the template, which
          // lets the author stack placeholders one per line. When the field is
          // empty that break has to go too, or it leaves a blank line behind.
          if (value === "" && block.line_mode === "conditional") dropTrailingNewline();
          if (authored) {
            pushAuthoredText(push, value, !!block.bold, !!block.italic);
          } else {
            push(value, !!block.bold, !!block.italic);
          }
          break;
        }
        case "conditional":
          if (evaluateCondition(block.condition, variables)) visit(block.blocks);
          break;
      }
    }
  };

  visit(blocks);
  return runs;
}

/** Concatenate runs, discarding their formatting. */
export function runsToPlainText(runs: TextRun[]): string {
  return runs.map((r) => r.text).join("");
}

/** Render the block tree into final report text using the supplied values. */
export function interpolateMask(
  blocks: MaskBlock[],
  variables: Record<string, string>,
): string {
  return runsToPlainText(renderRuns(blocks, variables));
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate a mask. `requireDescription` is implied by `is_published`. */
export function validateMask(mask: Mask): ValidationResult {
  const errors: string[] = [];

  if (!mask.name?.trim()) errors.push("Nome obrigatório");
  if (!mask.blocks || mask.blocks.length === 0) errors.push("Máscara vazia");
  if (mask.is_published && !mask.description?.trim()) {
    errors.push("Descrição obrigatória para publicar");
  }

  // A published mask must contain at least one renderable (non-empty) block.
  if (mask.is_published && !hasRenderableContent(mask.blocks)) {
    errors.push("Máscara publicada precisa de conteúdo");
  }

  return { valid: errors.length === 0, errors };
}

function hasRenderableContent(blocks: MaskBlock[]): boolean {
  return blocks.some((block) => {
    if (block.type === "text") return block.content.trim().length > 0;
    if (block.type === "variable") return true;
    if (block.type === "conditional") return hasRenderableContent(block.blocks);
    return false;
  });
}

/** Required variable names that have no value supplied (and no default). */
export function missingRequiredVariables(
  blocks: MaskBlock[],
  variables: Record<string, string>,
): string[] {
  const missing = new Set<string>();
  const visit = (bs: MaskBlock[]) => {
    for (const block of bs) {
      if (block.type === "variable" && block.required) {
        const { text: value } = resolveVariableValue(block, variables);
        if (value === "") missing.add(normalizeMaskVariableName(block.variable_name));
      } else if (block.type === "conditional") {
        // Only require fields inside a branch that is actually rendered.
        if (evaluateCondition(block.condition, variables)) visit(block.blocks);
      }
    }
  };
  visit(blocks);
  return [...missing];
}

/** Whether `plan` may own `currentCount + 1` masks. */
export function canCreateMask(plan: Plan, currentCount: number): boolean {
  return currentCount < maskQuota(plan);
}

// ---------------------------------------------------------------------------
// Field kinds that carry structure beyond a plain string.

/** How many boxes a `measure` field shows (clamped to 1-3, default 3). */
export function measureDims(field: VariableBlock): number {
  return Math.min(3, Math.max(1, field.measure_dims ?? 3));
}

/**
 * Join measurement boxes into "a x b x c unit". Empty boxes are skipped, so a
 * 3-box field can still express a 2-dimension measurement and an all-empty
 * field yields "" (inserting nothing).
 */
export function composeMeasure(parts: string[], unit?: string): string {
  const filled = parts.map((p) => p.trim()).filter((p) => p !== "");
  if (filled.length === 0) return "";
  const joined = filled.join(" x ");
  const suffix = unit?.trim();
  return suffix ? `${joined} ${suffix}` : joined;
}

/** Split a stored measurement value back into boxes for editing. */
export function splitMeasure(value: string, field: VariableBlock): string[] {
  const dims = measureDims(field);
  const unit = field.unit?.trim();
  let rest = value.trim();
  if (unit && rest.endsWith(unit)) rest = rest.slice(0, -unit.length).trim();
  const parts = rest ? rest.split(/\s*x\s*/i) : [];
  return Array.from({ length: dims }, (_, i) => parts[i] ?? "");
}

/**
 * Line break a field's `line_mode` puts before its text. "conditional" adds
 * nothing here: its break lives in the template and `interpolateMask` removes
 * it when the field turns out empty.
 */
const LINE_MODE_PREFIX: Record<LineMode, string> = {
  inline: "",
  line: "\n",
  paragraph: "\n\n",
  conditional: "",
};

/**
 * The text a checkbox inserts in the given state, including the line break its
 * `line_mode` asks for. Keeping the break out of the text means mask authors
 * never have to type an invisible newline to get the field on its own line.
 *
 * An empty text for a state inserts nothing at all — not even the line break —
 * so a "conditional" field simply drops out of the report in that state.
 */
export function checkboxValue(field: VariableBlock, checked: boolean): string {
  const text = (checked ? field.checked_text : field.unchecked_text) ?? "";
  if (text === "") return "";
  return LINE_MODE_PREFIX[field.line_mode ?? "inline"] + text;
}

/** Order-independent identity of a set of ticked items. */
function combinationKey(items: string[]): string {
  return [...items].sort().join("");
}

/**
 * Every combination of `items`, ordered by how many are ticked: none first,
 * then each single, then each pair, and so on. This is the order the editor
 * lists its text boxes in, which is how a person enumerates the cases.
 */
export function multiCombinations(items: string[]): string[][] {
  const all: string[][] = [];
  for (let size = 0; size <= items.length; size += 1) {
    const pick = (start: number, current: string[]) => {
      if (current.length === size) {
        all.push([...current]);
        return;
      }
      for (let i = start; i < items.length; i += 1) {
        current.push(items[i]);
        pick(i + 1, current);
        current.pop();
      }
    };
    pick(0, []);
  }
  return all;
}

/**
 * The text a `multicheck` field inserts for the items currently ticked. Each
 * combination has its own text, so wording that changes with the combination is
 * written out rather than assembled — an unlisted combination, or one whose
 * text is blank, inserts nothing.
 */
export function composeMultiCheck(field: VariableBlock, selected: string[]): string {
  // Ignore ticks for items that are no longer options.
  const items = (field.options ?? []).filter((option) => selected.includes(option));
  const wanted = combinationKey(items);
  const match = (field.combinations ?? []).find(
    (c) => combinationKey(c.items) === wanted,
  );

  const text = match?.text ?? "";
  if (text === "") return "";
  return LINE_MODE_PREFIX[field.line_mode ?? "inline"] + text;
}

/**
 * The value a field holds when a mask is first opened. Select fields land on
 * their first option and ticked checkboxes on their text; everything else
 * starts empty, which renders as nothing.
 */
export function initialFieldValue(field: VariableBlock): string {
  switch (field.field_type) {
    case "select":
      return field.options?.[0] ?? "";
    case "checkbox":
      // The unticked state can carry text too, so it is not simply "".
      return checkboxValue(field, !!field.default_checked);
    case "multicheck":
      return composeMultiCheck(field, []);
    default:
      return "";
  }
}

/**
 * Whether an empty value means "the user still has to fill this in" (text
 * fields) rather than "insert nothing" (select, checkbox, measure).
 */
export function fieldExpectsInput(field: VariableBlock): boolean {
  return field.field_type === "text" || field.field_type === "textarea";
}

// ---------------------------------------------------------------------------
// Template <-> blocks conversion.
// The mask editor works on a "template" string with {{variable}} placeholders
// plus a list of field definitions; storage/execution uses the block tree.

/**
 * A fresh matcher for `{{variable}}` placeholders, capturing the name. Each
 * caller gets its own instance because scanning mutates `lastIndex`, and the
 * template editor scans the same text concurrently with the parser.
 */
export function placeholderPattern(): RegExp {
  return /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu;
}

/** Collect every variable block in the tree, deduped by name, in order. */
export function collectFieldDefs(blocks: MaskBlock[]): VariableBlock[] {
  const out: VariableBlock[] = [];
  const seen = new Set<string>();
  const visit = (bs: MaskBlock[]) => {
    for (const b of bs) {
      if (b.type === "variable") {
        const name = normalizeMaskVariableName(b.variable_name);
        if (name && !seen.has(name)) {
          seen.add(name);
          out.push({ ...b, variable_name: name });
        }
      } else if (b.type === "conditional") {
        visit(b.blocks);
      }
    }
  };
  visit(blocks);
  return out;
}

/**
 * Flatten a block tree back into a template string. Conditional sections are
 * inlined (their content emitted in place) — the template editor does not
 * round-trip conditions.
 */
export function blocksToTemplate(blocks: MaskBlock[]): string {
  let out = "";
  let bold = false;
  let italic = false;

  /** Open or close the markers so they match `block`'s formatting. */
  const syncMarkers = (block: MaskBlock) => {
    const wantBold = block.type !== "conditional" && !!block.bold;
    const wantItalic = block.type !== "conditional" && !!block.italic;
    // Close italic before bold so the markers stay properly nested.
    if (italic !== wantItalic && italic) {
      out += ITALIC_MARKER;
      italic = false;
    }
    if (bold !== wantBold) {
      out += BOLD_MARKER;
      bold = wantBold;
    }
    if (italic !== wantItalic) {
      out += ITALIC_MARKER;
      italic = wantItalic;
    }
  };

  for (const block of blocks) {
    syncMarkers(block);
    switch (block.type) {
      case "text":
        out += block.content;
        break;
      case "variable":
        out += `{{${normalizeMaskVariableName(block.variable_name)}}}`;
        break;
      case "conditional":
        out += blocksToTemplate(block.blocks);
        break;
    }
  }

  if (italic) out += ITALIC_MARKER;
  if (bold) out += BOLD_MARKER;
  return out;
}

/**
 * Markers the template uses for character formatting. The editor writes them
 * when the author presses the bold/italic shortcut, so they are not something
 * anyone has to type — but a report that genuinely needs a literal "**" would
 * have to avoid it.
 */
export const BOLD_MARKER = "**";
export const ITALIC_MARKER = "__";

/**
 * Parse a template string into alternating text/variable blocks, tracking the
 * bold/italic markers so every block records the formatting in force where it
 * appears. Placeholders without a matching field definition get a plain text
 * field created for them.
 */
export function templateToBlocks(
  template: string,
  fields: VariableBlock[],
  makeId: () => string = () => Math.random().toString(36).slice(2, 10),
): MaskBlock[] {
  const byName = new Map(fields.map((f) => [normalizeMaskVariableName(f.variable_name), f]));
  const blocks: MaskBlock[] = [];
  const placeholder = placeholderPattern();

  let bold = false;
  let italic = false;
  let pending = "";
  let i = 0;

  const flushText = () => {
    if (pending === "") return;
    blocks.push({
      id: makeId(),
      type: "text",
      content: pending,
      ...(bold ? { bold: true } : {}),
      ...(italic ? { italic: true } : {}),
    });
    pending = "";
  };

  while (i < template.length) {
    if (template.startsWith(BOLD_MARKER, i)) {
      flushText();
      bold = !bold;
      i += BOLD_MARKER.length;
      continue;
    }
    if (template.startsWith(ITALIC_MARKER, i)) {
      flushText();
      italic = !italic;
      i += ITALIC_MARKER.length;
      continue;
    }

    // Placeholders are matched at the current position only.
    placeholder.lastIndex = i;
    const match = placeholder.exec(template);
    if (match && match.index === i) {
      flushText();
      const name = normalizeMaskVariableName(match[1]);
      const def = byName.get(name);
      const base: VariableBlock = def
        ? { ...def, id: makeId(), variable_name: name }
        : {
            id: makeId(),
            type: "variable",
            variable_name: name,
            field_type: "text",
            required: false,
          };
      blocks.push({
        ...base,
        ...(bold ? { bold: true } : { bold: undefined }),
        ...(italic ? { italic: true } : { italic: undefined }),
      });
      i += match[0].length;
      continue;
    }

    pending += template[i];
    i += 1;
  }
  flushText();
  return blocks;
}

export { BASIC_MASK_LIMIT };
