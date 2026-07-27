// FastPath - Core TypeScript types
// Shared domain model for masks, blocks, users and history.

export type Language = "pt-BR" | "en";

export type Plan = "trial" | "basic" | "creator";

/**
 * Kinds of input a mask can ask for:
 * - `text` / `textarea`: free text typed by the user
 * - `select`: one of a fixed list of values
 * - `checkbox`: inserts `checked_text` when ticked, nothing when not
 * - `measure`: 1-3 numeric boxes joined by " x ", with an optional unit
 * - `computed`: never shown in the panel — its text (`checked_text` or
 *   `unchecked_text`, same as a checkbox) is picked automatically from
 *   `computed_condition` against another field's value, e.g. a variable that
 *   resolves to "mitose" or "mitoses" depending on a count elsewhere
 */
export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "checkbox"
  | "measure"
  | "multicheck"
  | "computed";

/**
 * Where a field's text lands, and what happens to the surrounding line break
 * when the field is empty:
 * - `inline`: continues the current line
 * - `line`: supplies its own line break before the text
 * - `paragraph`: supplies a blank line and then its own line
 * - `conditional`: the template holds the line break (so the author can stack
 *   placeholders one per line and read them), and that break is swallowed when
 *   the field is empty, leaving no blank line behind
 */
export type LineMode = "inline" | "line" | "paragraph" | "conditional";

/**
 * `gt`/`lt`/`gte`/`lte` compare both sides as numbers (parsed with `Number`)
 * and never match when either side isn't a valid number.
 */
export type ConditionOperator = "equals" | "contains" | "gt" | "lt" | "gte" | "lte";

/**
 * How generated text reaches the external report system:
 * - `clipboard`: copy only ("Copiar")
 * - `paste`: copy + simulated Ctrl/Cmd+V ("Colar automaticamente")
 * - `key-by-key`: simulated typing ("Digitar no sistema")
 */
export type ExecutionMethod = "clipboard" | "paste" | "key-by-key";

/** A stretch of generated report text that shares one formatting state. */
export interface TextRun extends Formatting {
  text: string;
}

/**
 * One row of a `multicheck` field's text table: which items are ticked, and
 * what to insert for exactly that combination.
 */
export interface MultiCombination {
  /** Ticked item labels. An empty array is the "nothing ticked" case. */
  items: string[];
  text: string;
}

/** A user input field that gets substituted into the generated report. */
export interface VariableBlock extends Formatting {
  id: string;
  type: "variable";
  /** Spaces are normalized to "_" (see normalizeMaskVariableName). */
  variable_name: string;
  field_type: FieldType;
  /**
   * Fallback used when the field is left empty. Only meaningful for text
   * fields: `checkbox`, `measure` and `select` treat an empty value as
   * "insert nothing", so setting a default here would defeat that.
   */
  default?: string;
  /** Options for `select` fields. */
  options?: string[];
  /** `checkbox`: text inserted when ticked. Empty inserts nothing. */
  checked_text?: string;
  /**
   * `checkbox`: text inserted when NOT ticked. Empty inserts nothing — and
   * under `line_mode: "conditional"` that also drops the line the template
   * reserved for this field.
   */
  unchecked_text?: string;
  /** `checkbox`: whether it starts ticked when the mask is opened. */
  default_checked?: boolean;
  /**
   * Where the inserted text goes relative to the surrounding text. Saves the
   * author from having to type invisible line breaks into the value — see
   * `checkboxValue` and `interpolateMask`. Defaults to "inline".
   */
  line_mode?: LineMode;
  /**
   * `multicheck`: one text per combination of ticked items, including the
   * combination where nothing is ticked. Wording that changes with the
   * combination ("intestinal" vs "intestinal e pseudopilórica") is spelled out
   * per case rather than assembled from a connector.
   */
  combinations?: MultiCombination[];
  /** `measure`: how many boxes to show (1-3), joined by " x ". */
  measure_dims?: number;
  /** `measure`: unit appended after the last box, e.g. "cm". */
  unit?: string;
  required: boolean;
  /**
   * Show this field in the floating panel only when another field's current
   * value matches this condition. Undefined means always shown.
   */
  condition?: FieldCondition;
  /**
   * `computed`: which text this field resolves to — `checked_text` when this
   * matches, `unchecked_text` otherwise. Never shown as an input.
   */
  computed_condition?: FieldCondition;
}

export interface Condition {
  variable_name: string;
  operator: ConditionOperator;
  value: string;
}

/**
 * A field's visibility rule: shown when the source field's current value
 * matches ANY of `values` (OR) — e.g. several ticked-option toggles left
 * active on a `select` source.
 */
export interface FieldCondition {
  variable_name: string;
  operator: ConditionOperator;
  values: string[];
}

/** A section that is only rendered when its condition is met. May nest. */
export interface ConditionalBlock {
  id: string;
  type: "conditional";
  condition: Condition;
  blocks: MaskBlock[];
}

/**
 * Character formatting a chunk of the report carries. Only reaches the report
 * when the output method can express it: rich-text paste, or key-by-key typing
 * with the bold/italic hotkeys configured.
 */
export interface Formatting {
  bold?: boolean;
  italic?: boolean;
}

/** A literal chunk of text emitted verbatim into the output. */
export interface TextBlock extends Formatting {
  id: string;
  type: "text";
  content: string;
}

export type MaskBlock = VariableBlock | ConditionalBlock | TextBlock;

export interface MaskRating {
  avg: number;
  count: number;
}

export interface Mask {
  id: string;
  creator_id: string;
  name: string;
  description?: string;
  /** Grande área, e.g. "Gineco" | "Hemato" | "Gastro". User-extensible. */
  area: string;
  /** Categoria / tipo de amostra, e.g. "Biópsia", "Citologia". */
  category: string;
  blocks: MaskBlock[];
  is_published: boolean;
  is_official: boolean;
  created_at: string;
  updated_at?: string;
  rating?: MaskRating;
  download_count?: number;
  /** Names of variables used by this mask (derived from blocks). */
  variables: string[];
}

export interface User {
  uid: string;
  email: string;
  name: string;
  avatar_url?: string;
  plan: Plan;
  trial_expires?: string | null;
  language: Language;
  created_at: string;
  stripe_customer_id?: string;
}

export interface Review {
  id: string;
  mask_id: string;
  user_id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  created_at: string;
  helpful_count: number;
}

export interface HistoryEntry {
  id: string;
  mask_id: string;
  generated_content: string;
  variables_used: Record<string, string>;
  timestamp: string;
  execution_method: ExecutionMethod;
}

export interface UserSettings {
  language: Language;
  /** Delay between simulated keystrokes, in milliseconds. */
  keyByKeyDelay: number;
  /** Default insertion strategy when the user clicks "Inserir". */
  insertMethod: ExecutionMethod;
  hotkeyOpenMenu: string;
  hotkeyRunLast: string;
  hotkeyConfirm: string;
  hotkeyCancel: string;
  hotkeyVoice: string;
  /**
   * Copy/paste as rich text so bold and italic survive. Off by default: report
   * systems that only take plain text would otherwise receive markup.
   */
  richText: boolean;
  /**
   * Key combinations the TARGET editor uses to toggle bold and italic. Sent
   * while typing key-by-key; blank disables formatting for that method.
   */
  hotkeyBold: string;
  hotkeyItalic: string;
  /** Max history entries kept locally before pruning. */
  historyLimit: number;
  /** Voice dictation (stub until STT engine is wired). */
  voiceEnabled: boolean;
  voiceLang: Language;
  /** Mic sensitivity 0-100. */
  voiceSensitivity: number;
  startWithOS: boolean;
  alwaysOnTop: boolean;
  /** Which edge of the screen the floating panel docks to. */
  panelSide: "left" | "right";
  /** Whether the panel shows the generated-report preview below the fields. */
  showPreview: boolean;
  /** Height (%) the fields pane gets of the fields/preview split; the user drags this. */
  previewSplit: number;
}
