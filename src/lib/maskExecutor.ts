// FastPath - Core mask logic (framework-agnostic).
// Interpolation, validation, variable extraction and name normalization.

import type {
  Condition,
  LineMode,
  Mask,
  MaskBlock,
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
    default:
      return false;
  }
}

/** Resolve the value for a variable block, falling back to its default. */
function resolveVariableValue(
  block: VariableBlock,
  variables: Record<string, string>,
): string {
  const key = normalizeMaskVariableName(block.variable_name);
  const provided = variables[key];
  if (provided !== undefined && provided !== "") return provided;
  return block.default ?? "";
}

/** Render the block tree into final report text using the supplied values. */
export function interpolateMask(
  blocks: MaskBlock[],
  variables: Record<string, string>,
): string {
  let result = "";

  for (const block of blocks) {
    switch (block.type) {
      case "text":
        result += block.content;
        break;
      case "variable": {
        const value = resolveVariableValue(block, variables);
        // A "conditional" field takes its line break from the template, which
        // lets the author stack placeholders one per line. When the field is
        // empty that break has to go too, or it leaves a blank line behind.
        if (value === "" && block.line_mode === "conditional") {
          result = result.replace(/\n$/, "");
        }
        result += value;
        break;
      }
      case "conditional":
        if (evaluateCondition(block.condition, variables)) {
          result += interpolateMask(block.blocks, variables);
        }
        break;
    }
  }

  return result;
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
        const value = resolveVariableValue(block, variables);
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

const PLACEHOLDER_RE = /\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu;

/**
 * Matches a `{{variable}}` placeholder, capturing the name. Exposed so the
 * template editor highlights exactly what the parser will recognise.
 * Global + sticky state is per-call: always use with `matchAll`.
 */
export const PLACEHOLDER_PATTERN = PLACEHOLDER_RE;

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
  for (const block of blocks) {
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
  return out;
}

/**
 * Parse a template string into alternating text/variable blocks. Placeholders
 * without a matching field definition get a plain text field created for them.
 */
export function templateToBlocks(
  template: string,
  fields: VariableBlock[],
  makeId: () => string = () => Math.random().toString(36).slice(2, 10),
): MaskBlock[] {
  const byName = new Map(fields.map((f) => [normalizeMaskVariableName(f.variable_name), f]));
  const blocks: MaskBlock[] = [];
  let lastIndex = 0;

  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      blocks.push({ id: makeId(), type: "text", content: template.slice(lastIndex, idx) });
    }
    const name = normalizeMaskVariableName(match[1]);
    const def = byName.get(name);
    blocks.push(
      def
        ? { ...def, id: makeId(), variable_name: name }
        : { id: makeId(), type: "variable", variable_name: name, field_type: "text", required: false },
    );
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < template.length) {
    blocks.push({ id: makeId(), type: "text", content: template.slice(lastIndex) });
  }
  return blocks;
}

export { BASIC_MASK_LIMIT };
