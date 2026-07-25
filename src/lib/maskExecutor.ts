// FastPath - Core mask logic (framework-agnostic).
// Interpolation, validation, variable extraction and name normalization.

import type {
  Condition,
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
      case "variable":
        result += resolveVariableValue(block, variables);
        break;
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
 * The value a field holds when a mask is first opened. Select fields land on
 * their first option and ticked checkboxes on their text; everything else
 * starts empty, which renders as nothing.
 */
export function initialFieldValue(field: VariableBlock): string {
  switch (field.field_type) {
    case "select":
      return field.options?.[0] ?? "";
    case "checkbox":
      return field.default_checked ? (field.checked_text ?? "") : "";
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
