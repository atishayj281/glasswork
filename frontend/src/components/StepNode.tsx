import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PipelineStep } from "../types";

const TYPE_ACCENTS: Record<string, string> = {
  filter: "border-l-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.2)]",
  groupby_agg: "border-l-purple-400 shadow-[0_0_12px_rgba(192,132,252,0.2)]",
  visualize: "border-l-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.2)]",
  sort: "border-l-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.2)]",
  select_columns: "border-l-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]",
  rename: "border-l-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.2)]",
  compute_column: "border-l-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]",
  default: "border-l-slate-500",
};

function StepNode({ data, selected }: NodeProps) {
  const step = data.step as PipelineStep;
  const accentClass = TYPE_ACCENTS[step.type] || TYPE_ACCENTS.default;

  return (
    <div
      className={`
        px-3 py-2 rounded-lg min-w-[160px] glass-card border-l-4
        ${accentClass}
        ${selected ? "ring-2 ring-neon-cyan shadow-neon-md" : ""}
        transition-all duration-200
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-neon-cyan !border-2 !border-slate-900 !shadow-neon-sm"
      />
      <p className="text-[10px] font-display font-medium text-slate-500 uppercase tracking-widest">
        {step.type}
      </p>
      <p className="text-sm font-semibold text-slate-200 truncate">{step.label}</p>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-neon-cyan !border-2 !border-slate-900 !shadow-neon-sm"
      />
    </div>
  );
}

export default memo(StepNode);
