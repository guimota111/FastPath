// FastPath - Core TypeScript types
// Shared domain model for masks, blocks, users and history.

export type Language = "pt-BR" | "en";

export type Plan = "trial" | "basic" | "creator";

export type FieldType = "text" | "textarea" | "select" | "checkbox";

export type ConditionOperator = "equals" | "contains";

export type ExecutionMethod = "clipboard" | "key-by-key";

/** A user input field that gets substituted into the generated report. */
export interface VariableBlock {
  id: string;
  type: "variable";
  /** Spaces are normalized to "_" (see normalizeMaskVariableName). */
  variable_name: string;
  field_type: FieldType;
  default?: string;
  /** Options for `select` fields. */
  options?: string[];
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
  /** User-defined category, e.g. "gastro" | "gineco" | "hemato". */
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
  /** Max history entries kept locally before pruning. */
  historyLimit: number;
}
