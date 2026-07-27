import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
  Upload, 
  MessageSquareCode, 
  GitFork, 
  Play, 
  RefreshCw, 
  ArrowRight,
  Terminal,
  FileCheck
} from "lucide-react";

interface StepItem {
  id: string;
  num: string;
  title: string;
  description: string;
  icon: React.ElementType;
  interactivePreview: {
    title: string;
    code: string;
    details: string;
  };
}

const STEPS: StepItem[] = [
  {
    id: "step-1",
    num: "01",
    title: "Upload",
    description: "Drop any CSV or Excel file — Glasswork instantly profiles column names, data types, and null rates.",
    icon: Upload,
    interactivePreview: {
      title: "Step 01: Metadata Profiling",
      code: "upload('dataset.csv') -> profile = { columns: ['date', 'region', 'sales'], rows: 24500 }",
      details: "Raw file stays local; zero data rows transmitted to external models."
    }
  },
  {
    id: "step-2",
    num: "02",
    title: "Chat",
    description: "Converse in plain English about your analysis goals without writing a single line of SQL or Python.",
    icon: MessageSquareCode,
    interactivePreview: {
      title: "Step 02: Intent Stream",
      code: "User: 'Find top 5 regions by total revenue in Q3 where sales > $1,000'",
      details: "Agent interprets goals against your dataset schema."
    }
  },
  {
    id: "step-3",
    num: "03",
    title: "Generate",
    description: "The agent synthesizes a multi-step DAG pipeline (Filter → GroupBy → Sort → Visualize) on the canvas.",
    icon: GitFork,
    interactivePreview: {
      title: "Step 03: Visual DAG Synthesis",
      code: "Generated DAG: filter(sales>1000) -> groupby(region, sum(sales)) -> sort(desc) -> visualize(bar)",
      details: "Rendered as drag-and-drop editable React Flow nodes."
    }
  },
  {
    id: "step-4",
    num: "04",
    title: "Run",
    description: "Execute the pipeline to view real-time row count logs, data preview tables, and Plotly charts.",
    icon: Play,
    interactivePreview: {
      title: "Step 04: Local Execution",
      code: "Executing pandas pipeline... Node 1: 24,500 -> 18,200 rows. Node 2: 5 groups aggregated in 12ms.",
      details: "Step-by-step transparency with execution metrics."
    }
  },
  {
    id: "step-5",
    num: "05",
    title: "Iterate",
    description: "Click any node to tweak parameters manually, or ask the agent to revise the pipeline layout.",
    icon: RefreshCw,
    interactivePreview: {
      title: "Step 05: Parameter Tuning & Webhook Save",
      code: "node.updateParams({ top_n: 10 }) -> Re-run -> Save as Webhook Endpoint",
      details: "Full parameter control with 1-click webhook deployment."
    }
  }
];

export default function HowItWorks() {
  const [activeStepId, setActiveStepId] = useState<string>("step-3");
  const activeStep = STEPS.find((s) => s.id === activeStepId) || STEPS[2];

  return (
    <section className="w-full my-20">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <span className="font-mono text-xs text-[#F5A623] uppercase tracking-widest font-semibold">
          SYSTEM WORKFLOW
        </span>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#E7E9EE] mt-2 tracking-tight">
          How Glasswork Operates
        </h2>
        <p className="text-[#8B92A3] text-base mt-3 font-sans">
          A deterministic, 5-step sequence from raw file upload to automated insight visualization.
        </p>
      </div>

      {/* 5-Step Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {STEPS.map((step, idx) => {
          const IconComp = step.icon;
          const isActive = activeStepId === step.id;

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: idx * 0.05 }}
              onClick={() => setActiveStepId(step.id)}
              className={`group cursor-pointer p-5 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                isActive
                  ? "bg-[#12161F] border-[#4DD9C4] ring-1 ring-[#4DD9C4]/40 shadow-[0_0_20px_rgba(77,217,196,0.15)] -translate-y-1"
                  : "bg-[#12161F]/60 border-white/10 hover:border-[#4DD9C4]/60 hover:bg-[#12161F] hover:-translate-y-1"
              }`}
            >
              <div>
                {/* Monospace 01-05 eyebrow */}
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-xs font-bold text-[#F5A623] px-2 py-0.5 rounded bg-[#F5A623]/10 border border-[#F5A623]/20">
                    {step.num}
                  </span>
                  <div className={`p-2 rounded-lg ${isActive ? "bg-[#4DD9C4]/20 text-[#4DD9C4]" : "bg-white/5 text-[#8B92A3] group-hover:text-[#4DD9C4]"}`}>
                    <IconComp className="w-4 h-4" />
                  </div>
                </div>

                <h3 className="font-display text-lg font-bold text-[#E7E9EE] mb-2">
                  {step.title}
                </h3>

                <p className="text-xs text-[#8B92A3] leading-relaxed font-sans">
                  {step.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-[#8B92A3] group-hover:text-[#4DD9C4]">
                <span>{isActive ? "Viewing" : "Click to view"}</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Interactive Step Live Console Output */}
      <motion.div 
        key={activeStep.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mt-6 p-5 rounded-xl bg-[#0B0E14] border border-cyan-500/20 font-mono text-xs"
      >
        <div className="flex items-center justify-between pb-3 border-b border-cyan-500/15 mb-3">
          <div className="flex items-center gap-2 text-[#E7E9EE] font-semibold">
            <Terminal className="w-4 h-4 text-[#4DD9C4]" />
            <span>{activeStep.interactivePreview.title}</span>
          </div>
          <span className="text-[11px] text-[#4DD9C4] px-2 py-0.5 rounded bg-[#4DD9C4]/10 border border-[#4DD9C4]/20">
            Step {activeStep.num} Active
          </span>
        </div>

        <div className="bg-[#12161F] p-3 rounded border border-white/5 text-[#4DD9C4] overflow-x-auto">
          <code>{activeStep.interactivePreview.code}</code>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[#8B92A3] text-[11px]">
          <FileCheck className="w-3.5 h-3.5 text-[#F5A623]" />
          <span>{activeStep.interactivePreview.details}</span>
        </div>
      </motion.div>
    </section>
  );
}
