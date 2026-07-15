import type { PipelineStep } from "../types";
import { Input, Select, Textarea } from "./ui/Input";
import Button from "./ui/Button";

const STEP_TYPES = [
  "filter",
  "select_columns",
  "rename",
  "fill_na",
  "cast_type",
  "groupby_agg",
  "sort",
  "deduplicate",
  "compute_column",
  "visualize",
] as const;

interface Props {
  step: PipelineStep;
  onChange: (step: PipelineStep) => void;
  onClose: () => void;
}

export default function StepEditor({ step, onChange, onClose }: Props) {
  const updateParam = (key: string, value: unknown) => {
    onChange({ ...step, params: { ...step.params, [key]: value } });
  };

  const renderFields = () => {
    switch (step.type) {
      case "filter":
        return (
          <>
            <Input label="Column" value={String(step.params.column ?? "")} onChange={(e) => updateParam("column", e.target.value)} />
            <Select label="Operator" value={String(step.params.op ?? "eq")} options={["eq", "neq", "gt", "gte", "lt", "lte", "contains", "is_null", "not_null"]} onChange={(v) => updateParam("op", v)} />
            <Input label="Value" value={String(step.params.value ?? "")} onChange={(e) => updateParam("value", e.target.value)} />
          </>
        );
      case "groupby_agg":
        return (
          <>
            <Input label="Group By (comma-separated)" value={String((step.params.group_by as string[])?.join(", ") ?? "")} onChange={(e) => updateParam("group_by", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
            <Textarea label="Aggregations (JSON)" value={JSON.stringify(step.params.aggregations ?? {}, null, 2)} onChange={(e) => { try { updateParam("aggregations", JSON.parse(e.target.value)); } catch { /* */ } }} rows={4} />
          </>
        );
      case "visualize":
        return (
          <>
            <Select label="Chart Type" value={String(step.params.chart_type ?? "bar")} options={["bar", "line", "scatter", "pie", "histogram", "heatmap"]} onChange={(v) => updateParam("chart_type", v)} />
            <Input label="X Axis" value={String(step.params.x ?? "")} onChange={(e) => updateParam("x", e.target.value)} />
            <Input label="Y Axis" value={String(step.params.y ?? "")} onChange={(e) => updateParam("y", e.target.value)} />
            <Input label="Title" value={String(step.params.title ?? step.label)} onChange={(e) => updateParam("title", e.target.value)} />
          </>
        );
      case "sort":
        return (
          <>
            <Input label="Columns (comma-separated)" value={String((step.params.columns as string[])?.join(", ") ?? "")} onChange={(e) => updateParam("columns", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
            <Select label="Order" value={step.params.ascending === false ? "desc" : "asc"} options={["asc", "desc"]} onChange={(v) => updateParam("ascending", v === "asc")} />
          </>
        );
      case "compute_column":
        return (
          <>
            <Input label="Column Name" value={String(step.params.name ?? "")} onChange={(e) => updateParam("name", e.target.value)} />
            <Input label="Expression" value={String(step.params.expression ?? "")} onChange={(e) => updateParam("expression", e.target.value)} />
          </>
        );
      case "select_columns":
        return (
          <Input label="Columns (comma-separated)" value={String((step.params.columns as string[])?.join(", ") ?? "")} onChange={(e) => updateParam("columns", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
        );
      default:
        return (
          <Textarea label="Params (JSON)" value={JSON.stringify(step.params, null, 2)} onChange={(e) => { try { onChange({ ...step, params: JSON.parse(e.target.value) }); } catch { /* */ } }} rows={4} />
        );
    }
  };

  return (
    <div className="w-72 border-l border-neon-cyan/20 glass-panel p-4 overflow-y-auto h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-sm tracking-wider text-slate-200 uppercase">Edit Step</h3>
        <Button variant="ghost" size="sm" onClick={onClose} className="!px-2 !py-1 text-lg">
          &times;
        </Button>
      </div>

      <Input label="Label" value={step.label} onChange={(e) => onChange({ ...step, label: e.target.value })} />
      <Select label="Type" value={step.type} options={[...STEP_TYPES]} onChange={(v) => onChange({ ...step, type: v as PipelineStep["type"] })} />

      <div className="my-4 border-t section-divider" />

      <div className="space-y-3">{renderFields()}</div>
    </div>
  );
}
