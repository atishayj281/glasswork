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
  | "visualize";

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
