import React, { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { 
  FileSpreadsheet, 
  Filter, 
  Layers, 
  BarChart3, 
  CheckCircle2, 
  Terminal, 
  Play, 
  RotateCcw,
  Sparkles,
  Zap
} from "lucide-react";

interface NodeData {
  id: string;
  type: string;
  label: string;
  subtitle: string;
  icon: React.ElementType;
  params: Record<string, string>;
  output: string;
  status: "idle" | "running" | "complete";
}

const SAMPLE_DATASETS = [
  {
    name: "Q3_Sales_Metrics.csv",
    rows: "14,250 rows",
    nodes: [
      {
        id: "upload",
        type: "upload",
        label: "Upload Dataset",
        subtitle: "Q3_Sales_Metrics.csv",
        icon: FileSpreadsheet,
        params: { columns: "region, category, revenue, units_sold", null_rate: "0.2%" },
        output: "Schema profiled (4 cols)",
        status: "complete"
      },
      {
        id: "filter",
        type: "filter",
        label: "filter",
        subtitle: "region == 'North America'",
        icon: Filter,
        params: { column: "region", operator: "==", value: "North America" },
        output: "8,120 rows remaining",
        status: "complete"
      },
      {
        id: "groupby_agg",
        type: "groupby_agg",
        label: "groupby_agg",
        subtitle: "category -> sum(revenue)",
        icon: Layers,
        params: { by: "category", agg: "sum(revenue)" },
        output: "5 category groups",
        status: "complete"
      },
      {
        id: "visualize",
        type: "visualize",
        label: "visualize",
        subtitle: "Bar Chart (Revenue by Cat)",
        icon: BarChart3,
        params: { type: "bar", x: "category", y: "revenue_sum" },
        output: "Plotly figure rendered",
        status: "complete"
      }
    ]
  },
  {
    name: "Customer_Churn_2026.xlsx",
    rows: "48,900 rows",
    nodes: [
      {
        id: "upload",
        type: "upload",
        label: "Upload Dataset",
        subtitle: "Customer_Churn.xlsx",
        icon: FileSpreadsheet,
        params: { columns: "user_id, plan, tenure_months, churned", null_rate: "0.0%" },
        output: "Schema profiled (4 cols)",
        status: "complete"
      },
      {
        id: "filter",
        type: "filter",
        label: "filter",
        subtitle: "tenure_months > 12",
        icon: Filter,
        params: { column: "tenure_months", operator: ">", value: "12" },
        output: "31,400 rows remaining",
        status: "complete"
      },
      {
        id: "groupby_agg",
        type: "groupby_agg",
        label: "groupby_agg",
        subtitle: "plan -> mean(churned)",
        icon: Layers,
        params: { by: "plan", agg: "mean(churned)" },
        output: "3 plan tiers aggregated",
        status: "complete"
      },
      {
        id: "visualize",
        type: "visualize",
        label: "visualize",
        subtitle: "Heatmap (Tenure vs Churn)",
        icon: BarChart3,
        params: { type: "heatmap", x: "plan", y: "churn_rate" },
        output: "Interactive Plotly chart",
        status: "complete"
      }
    ]
  }
];

export default function HeroPipeline() {
  const shouldReduceMotion = useReducedMotion();
  const [activeDatasetIndex, setActiveDatasetIndex] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("groupby_agg");
  const [isGenerating, setIsGenerating] = useState(false);
  const [logText, setLogText] = useState("Agent DAG generator standby. Ready for user intent.");

  const currentDataset = SAMPLE_DATASETS[activeDatasetIndex];
  const selectedNode = currentDataset.nodes.find(n => n.id === selectedNodeId) || currentDataset.nodes[2];

  const triggerReGenerate = () => {
    setIsGenerating(true);
    setLogText("Parsing natural language request: 'Show me total revenue by product category for North America'...");
    setTimeout(() => {
      setLogText("Inspecting dataset schema: [region (str), category (str), revenue (float64)]");
    }, 600);
    setTimeout(() => {
      setLogText("Generating pipeline DAG: filter(region=='North America') -> groupby_agg(category, sum(revenue)) -> visualize(bar)");
    }, 1200);
    setTimeout(() => {
      setLogText("Execution complete. 4 nodes wired and verified in 42ms.");
      setIsGenerating(false);
    }, 1800);
  };

  return (
    <div className="w-full relative rounded-xl border border-cyan-500/20 bg-[#12161F]/90 backdrop-blur-md p-4 sm:p-6 shadow-2xl overflow-hidden">
      {/* Background instrumentation grid accent */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />
      
      {/* Header bar of visual control room */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-cyan-500/15 relative z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#0B0E14] border border-cyan-500/30">
            <span className="w-2 h-2 rounded-full bg-[#4DD9C4] animate-pulse" />
            <span className="font-mono text-xs text-[#E7E9EE] font-semibold tracking-wide">
              PIPELINE DAG #AG-8042
            </span>
          </div>
          <span className="font-mono text-xs text-[#8B92A3] hidden sm:inline-block">
            {currentDataset.rows} • Schema Only Mode
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Dataset switcher pills */}
          <div className="flex bg-[#0B0E14] p-1 rounded-md border border-cyan-500/20">
            {SAMPLE_DATASETS.map((ds, idx) => (
              <button
                key={ds.name}
                onClick={() => {
                  setActiveDatasetIndex(idx);
                  setSelectedNodeId("groupby_agg");
                }}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                  activeDatasetIndex === idx
                    ? "bg-[#4DD9C4]/15 text-[#4DD9C4] border border-[#4DD9C4]/40 font-medium"
                    : "text-[#8B92A3] hover:text-[#E7E9EE]"
                }`}
              >
                {ds.name.split("_")[0]}
              </button>
            ))}
          </div>

          <button
            onClick={triggerReGenerate}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#F5A623] hover:bg-[#f5a623]/90 text-[#0B0E14] font-mono text-xs font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50"
            title="Simulate Agent Generating Pipeline"
          >
            {isGenerating ? (
              <Sparkles className="w-3.5 h-3.5 animate-spin text-[#0B0E14]" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-[#0B0E14]" />
            )}
            <span>{isGenerating ? "Generating..." : "Re-Generate"}</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Pipeline Diagram Canvas */}
      <div className="relative z-10 my-4 py-2">
        {/* Desktop Layout: Horizontal DAG Flow */}
        <div className="hidden md:grid md:grid-cols-4 gap-4 items-center relative">
          
          {/* Animated Edge SVGs connecting the 4 nodes */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" overflow="visible">
            <defs>
              <linearGradient id="edge-flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4DD9C4" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#4DD9C4" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#F5A623" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            {/* Edge 1 -> 2 */}
            <line x1="22%" y1="50%" x2="28%" y2="50%" stroke="url(#edge-flow-grad)" strokeWidth="2" strokeDasharray="4 4" />
            {/* Edge 2 -> 3 */}
            <line x1="47%" y1="50%" x2="53%" y2="50%" stroke="url(#edge-flow-grad)" strokeWidth="2" strokeDasharray="4 4" />
            {/* Edge 3 -> 4 */}
            <line x1="72%" y1="50%" x2="78%" y2="50%" stroke="url(#edge-flow-grad)" strokeWidth="2" strokeDasharray="4 4" />

            {!shouldReduceMotion && (
              <>
                <motion.circle
                  r="3.5"
                  fill="#4DD9C4"
                  cy="50%"
                  animate={{ cx: ["22%", "28%"] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: "linear" }}
                />
                <motion.circle
                  r="3.5"
                  fill="#F5A623"
                  cy="50%"
                  animate={{ cx: ["47%", "53%"] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: "linear", delay: 0.6 }}
                />
                <motion.circle
                  r="3.5"
                  fill="#4DD9C4"
                  cy="50%"
                  animate={{ cx: ["72%", "78%"] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: "linear", delay: 1.2 }}
                />
              </>
            )}
          </svg>

          {/* Node 1 to 4 Render Loop */}
          {currentDataset.nodes.map((node, index) => {
            const IconComp = node.icon;
            const isSelected = selectedNodeId === node.id;
            const isAmber = node.id === "groupby_agg" || isSelected;

            return (
              <motion.div
                key={node.id}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 15, scale: 0.92 }}
                animate={shouldReduceMotion ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25, delay: index * 0.08 }}
                onClick={() => setSelectedNodeId(node.id)}
                className={`relative z-10 cursor-pointer p-4 rounded-lg border transition-all duration-200 ${
                  isSelected
                    ? "bg-[#12161F] border-[#F5A623] ring-2 ring-[#F5A623]/30 shadow-[0_0_20px_rgba(245,166,35,0.25)] scale-[1.02]"
                    : "bg-[#0B0E14]/80 border-cyan-500/20 hover:border-[#4DD9C4] hover:bg-[#12161F] hover:-translate-y-0.5"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${isSelected ? "bg-[#F5A623]/20 text-[#F5A623]" : "bg-[#4DD9C4]/15 text-[#4DD9C4]"}`}>
                      <IconComp className="w-4 h-4" />
                    </div>
                    <span className="font-mono text-xs font-semibold text-[#E7E9EE]">
                      {node.label}
                    </span>
                  </div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#4DD9C4]" />
                </div>

                <p className="font-mono text-[11px] text-[#8B92A3] truncate mb-2">
                  {node.subtitle}
                </p>

                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-[#8B92A3]">Out:</span>
                  <span className="text-[#4DD9C4] font-medium truncate max-w-[110px]">
                    {node.output}
                  </span>
                </div>

                {/* Animated Node Glow dot */}
                {isSelected && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#F5A623] animate-ping" />
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Mobile Layout: Vertical Stack */}
        <div className="flex md:hidden flex-col gap-3">
          {currentDataset.nodes.map((node, index) => {
            const IconComp = node.icon;
            const isSelected = selectedNodeId === node.id;
            return (
              <React.Fragment key={node.id}>
                <div
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? "bg-[#12161F] border-[#F5A623] ring-1 ring-[#F5A623]"
                      : "bg-[#0B0E14] border-cyan-500/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconComp className="w-4 h-4 text-[#4DD9C4]" />
                      <span className="font-mono text-xs font-bold text-[#E7E9EE]">
                        {node.label}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[#4DD9C4]">
                      {node.output}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-[#8B92A3] mt-1">
                    {node.subtitle}
                  </p>
                </div>
                {index < currentDataset.nodes.length - 1 && (
                  <div className="flex justify-center my-0.5">
                    <div className="w-0.5 h-4 bg-gradient-to-b from-[#4DD9C4] to-[#F5A623]" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Selected Node Parameter Telemetry Panel */}
      <div className="mt-4 p-3.5 rounded-lg bg-[#0B0E14] border border-cyan-500/20 relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-xs">
        <div className="flex items-center gap-2 text-[#8B92A3]">
          <Terminal className="w-4 h-4 text-[#F5A623] shrink-0" />
          <span className="text-[#E7E9EE] font-semibold">Node Telemetry [{selectedNode.label}]:</span>
          <span className="text-[#4DD9C4] truncate">
            {JSON.stringify(selectedNode.params).replace(/{|}/g, "")}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[11px] text-[#8B92A3]">
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Status: Execution Verified
          </span>
          <span className="text-[#8B92A3]">0ms latency</span>
        </div>
      </div>

      {/* Live Terminal Execution Log */}
      <div className="mt-2 p-2.5 rounded bg-[#0B0E14]/60 border border-white/5 font-mono text-[11px] text-[#8B92A3] flex items-center justify-between">
        <div className="flex items-center gap-2 truncate">
          <span className="text-[#F5A623] font-bold">&gt;</span>
          <span className="text-[#E7E9EE] truncate">{logText}</span>
        </div>
        <span className="text-[10px] text-[#8B92A3] shrink-0 pl-2">LiteLLM Stream Active</span>
      </div>
    </div>
  );
}
