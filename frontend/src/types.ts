export interface ExcelIngestMeta {
  sheet_name: string;
  header_row: number;
  merged_cells_resolved: number;
  merge_support: boolean;
}

export interface ColumnMeta {
  name: string;
  dtype: string;
  null_pct: number;
}

export interface DatasetProfile {
  file_name: string;
  row_count: number;
  column_count: number;
  columns: ColumnMeta[];
  excel_meta?: ExcelIngestMeta | null;
  process_on_client?: boolean;
}

export type StepType =
  | "filter"
  | "select_columns"
  | "rename"
  | "fill_na"
  | "cast_type"
  | "groupby_agg"
  | "sort"
  | "deduplicate"
  | "compute_column"
  | "visualize"
  | "compare_groups"
  | "correlation";

export interface NodePosition {
  x: number;
  y: number;
}

export interface PipelineStep {
  id: string;
  type: StepType;
  label: string;
  params: Record<string, unknown>;
  position: NodePosition;
}

export interface PipelineEdge {
  source: string;
  target: string;
}

export interface PipelinePlan {
  name: string;
  summary_template?: string | null;
  steps: PipelineStep[];
  edges: PipelineEdge[];
}

export interface StepLog {
  step_id: string;
  step_type: string;
  label: string;
  rows_in: number;
  rows_out: number;
  duration_ms: number;
  message: string;
}

export interface VizSpec {
  step_id: string;
  chart_type: string;
  title: string;
  figure: Record<string, unknown>;
}

export interface ExecutionResult {
  preview: Record<string, unknown>[];
  columns: string[];
  row_count: number;
  viz_specs: VizSpec[];
  execution_log: StepLog[];
  preview_step_id?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SavedPipeline {
  id: string;
  name: string;
  plan: PipelinePlan;
  profile?: DatasetProfile | null;
  createdAt?: { seconds: number };
  updatedAt?: { seconds: number };
}

export interface SavedPipelineItem {
  pipeline_id: string;
  uid: string;
  name: string;
  pipeline: PipelinePlan;
  created_at: string;
  last_triggered_at: string | null;
  trigger_count: number;
  status: "active" | "inactive";
}

export interface SavedPipelineCreateResponse extends SavedPipelineItem {
  webhook_secret: string;
}

export interface RotateSecretResponse {
  pipeline_id: string;
  webhook_secret: string;
  rotated_at: string;
}

export type TierName = "explorer" | "analyst" | "studio";

export interface TierLimits {
  max_uploads_per_month: number | null;
  max_file_size_mb: number;
  max_pipeline_runs_per_month: number | null;
  max_pipeline_generations_per_month: number | null;
  max_daily_tokens: number;
  max_daily_llm_calls: number;
  session_retention_days: number;
  allowed_llm_providers: string[];
  max_saved_pipelines: number | null;
  max_seats: number;
  export_formats: string[];
  priority_queue: boolean;
}

export interface TierUsage {
  uploads: number;
  pipeline_runs: number;
  pipeline_generations: number;
  daily_tokens: number;
  daily_llm_calls: number;
}

export interface BillingSubscription {
  uid: string;
  tier: TierName;
  tier_label: string;
  stripe_status: string | null;
  current_period_end: string | null;
  limits: TierLimits;
  usage_this_period: TierUsage;
}

export interface CheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface PortalResponse {
  portal_url: string;
}

/** Structured 402 error detail from the backend gating middleware */
export interface LimitExceededError {
  error: "limit_exceeded";
  tier: TierName;
  limit: string;
  message: string;
  upgrade_url: string;
}

/** Lightweight summary returned by GET /api/sessions */
export interface SessionSummary {
  session_id: string;
  file_name: string;
  pipeline_name: string | null;
  created_at: string; // ISO-8601
  chat_message_count: number;
  has_result: boolean;
}
