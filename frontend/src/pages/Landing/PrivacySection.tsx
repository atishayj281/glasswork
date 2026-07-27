import React, { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, EyeOff, CheckCircle2, Lock, Eye, AlertCircle } from "lucide-react";

export default function PrivacySection() {
  const [activeTab, setActiveTab] = useState<"schema" | "rows">("schema");

  return (
    <section className="w-full my-16">
      {/* Prominent single-line privacy callout card */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3 }}
        className="w-full rounded-xl border border-[#4DD9C4]/30 bg-[#12161F] p-6 sm:p-8 relative overflow-hidden shadow-xl"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#4DD9C4]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          
          <div className="flex items-start gap-4 max-w-2xl">
            <div className="p-3 rounded-lg bg-[#4DD9C4]/15 border border-[#4DD9C4]/30 text-[#4DD9C4] shrink-0 mt-1">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs text-[#4DD9C4] font-semibold tracking-wider uppercase">
                  Zero Data Leakage Guarantee
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Client-Isolated Execution
                </span>
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-bold text-[#E7E9EE] tracking-tight">
                The agent strictly sees schema metadata — never your raw data rows.
              </h3>
              <p className="text-sm text-[#8B92A3] mt-2 leading-relaxed font-sans">
                Glasswork transmits only column headers, data types, null counts, and row totals to the LLM. 
                Data transformations and chart renderings execute 100% locally in Python pandas or client web workers.
              </p>
            </div>
          </div>

          {/* Interactive Schema vs Raw Data Visual Inspector */}
          <div className="w-full lg:w-96 rounded-lg bg-[#0B0E14] border border-cyan-500/20 p-4 shrink-0 font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-cyan-500/15 mb-3">
              <span className="text-xs text-[#8B92A3] font-semibold">Metadata Inspector</span>
              
              <div className="flex bg-[#12161F] p-0.5 rounded border border-white/10">
                <button
                  onClick={() => setActiveTab("schema")}
                  className={`px-2.5 py-1 rounded text-[11px] transition-colors flex items-center gap-1 ${
                    activeTab === "schema"
                      ? "bg-[#4DD9C4]/20 text-[#4DD9C4] font-bold"
                      : "text-[#8B92A3] hover:text-[#E7E9EE]"
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  <span>Agent View</span>
                </button>

                <button
                  onClick={() => setActiveTab("rows")}
                  className={`px-2.5 py-1 rounded text-[11px] transition-colors flex items-center gap-1 ${
                    activeTab === "rows"
                      ? "bg-[#F5A623]/20 text-[#F5A623] font-bold"
                      : "text-[#8B92A3] hover:text-[#E7E9EE]"
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  <span>Raw File</span>
                </button>
              </div>
            </div>

            {activeTab === "schema" ? (
              <div className="space-y-2 text-[11px]">
                <div className="flex items-center justify-between text-emerald-400 bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Sent to LiteLLM prompt:
                  </span>
                  <span>4 columns</span>
                </div>
                <pre className="p-2.5 rounded bg-[#12161F] border border-white/5 text-[#4DD9C4] overflow-x-auto">
{`{
  "columns": [
    {"name": "region", "type": "str"},
    {"name": "revenue", "type": "float64"},
    {"name": "units", "type": "int64"}
  ],
  "row_count": 14250,
  "null_rate": 0.002
}`}
                </pre>
              </div>
            ) : (
              <div className="space-y-2 text-[11px]">
                <div className="flex items-center justify-between text-[#F5A623] bg-[#F5A623]/10 p-2 rounded border border-[#F5A623]/30">
                  <span className="flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5" />
                    Blocked from LLM:
                  </span>
                  <span>14,250 Sensitive Rows</span>
                </div>
                <div className="p-2.5 rounded bg-[#12161F] border border-white/5 space-y-1 opacity-60 backdrop-blur-sm select-none">
                  <div className="blur-[3px] text-[#E7E9EE]">1, "North", 45000.00, 120, "john.doe@corp.com"</div>
                  <div className="blur-[3px] text-[#E7E9EE]">2, "South", 32000.50, 95, "jane.smith@corp.com"</div>
                  <div className="blur-[3px] text-[#E7E9EE]">3, "West", 89100.20, 210, "alex.v@corp.com"</div>
                </div>
                <p className="text-[10px] text-[#8B92A3] text-center pt-1">
                  🔒 Processed locally in isolated Python environment
                </p>
              </div>
            )}
          </div>

        </div>
      </motion.div>
    </section>
  );
}
