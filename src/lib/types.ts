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
 */
export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "checkbox"
  | "measure"
  | "multicheck";

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

export type ConditionOperator = "equals" | "contains";

/**
 * How generated text reaches the external report system:
 * - `clipboard`: copy only ("Copiar")
 * - `paste`: copy + simulated Ctrl/Cmd+V ("Colar automaticamente")
 * - `key-by-key`: simulated typing ("Digitar no sistema")
 */
export type ExecutionMethod = "clipboard" | "paste" | "key-by-key";

/** A user input field that gets substituted into the generated report. */
export interface VariableBlock {
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
  /** `checkbox`: text inserted when ticked. Unticked inserts nothing. */
  checked_text?: string;
  /** `checkbox`: whether it starts ticked when the mask is opened. */
  default_checked?: boolean;
  /**
   * Where the inserted text goes relative to the surrounding text. Saves the
   * author from having to type invisible line breaks into the value — see
   * `checkboxCheckedValue` and `interpolateMask`. Defaults to "inline".
   */
  line_mode?: LineMode;
  /**
   * `multicheck`: text before the joined items, e.g.
   * ". Presença de focos de metaplasia ".
   */
  prefix?: string;
  /** `multicheck`: text after the joined items, e.g. ".". */
  suffix?: string;
  /**
   * `multicheck`: what joins the last two items, e.g. " e " so two ticked items
   * read "intestinal e pseudopilórica". Earlier items are joined with ", ".
   * Defaults to " e ".
   */
  last_separator?: string;
  /** `measure`: how many boxes to show (1-3), joined by " x ". */
  measure_dims?: number;
  /** `measure`: unit appended after the last box, e.g. "cm". */
  unit?: string;
  required: boolean;
}

export interface Condition {
  variable_name: string;
  operator: ConditionOperator;
  value: string;
}

/** A section that is only rendered when its condition is met. May nest. */
export interface ConditionalBlock {
  id: string;
  type: "conditional";
  condition: Condition;
  blocks: MaskBlock[];
}

/** A literal chunk of text emitted verbatim into the output. */
export interface TextBlock {
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
  /** Max history entries kept locally before pruning. */
  historyLimit: number;
  /** Voice dictation (stub until STT engine is wired). */
  voiceEnabled: boolean;
  voiceLang: Language;
  /** Mic sensitivity 0-100. */
  voiceSensitivity: number;
  startWithOS: boolean;
  alwaysOnTop: boolean;
}
