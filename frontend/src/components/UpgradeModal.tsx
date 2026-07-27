import React, { useState } from "react";
import type { LimitExceededError } from "../types";
import Button from "./ui/Button";

interface UpgradeModalProps {
  errorInfo?: LimitExceededError | null;
  onClose: () => void;
  onCheckout: (tier: "analyst" | "studio") => Promise<void>;
}

export default function UpgradeModal({ errorInfo, onClose, onCheckout }: UpgradeModalProps) {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const handleUpgrade = async (tier: "analyst" | "studio") => {
    try {
      setLoadingTier(tier);
      await onCheckout(tier);
    } catch (err) {
      console.error("Checkout redirect error:", err);
      setLoadingTier(null);
    }
  };

  const getLimitTitle = () => {
    if (!errorInfo) return "Upgrade your Glasswork Plan";
    switch (errorInfo.limit) {
      case "uploads":
        return "Upload Limit Reached";
      case "pipeline_runs":
        return "Pipeline Run Limit Reached";
      case "pipeline_generations":
        return "AI Generation Limit Reached";
      case "saved_pipelines":
        return "Saved Pipelines & Webhooks Required";
      case "file_size":
        return "File Size Limit Exceeded";
      case "llm_providers":
        return "Custom LLM Provider Locked";
      default:
        return "Plan Limit Reached";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl glass-panel p-6 rounded-2xl border border-neon-cyan/30 shadow-[0_0_50px_rgba(34,211,238,0.15)] overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-neon-cyan/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-mono p-2 transition-colors cursor-pointer"
        >
          ✕
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-xs font-mono mb-3">
            <span className="animate-pulse">⚡</span> Plan Upgrade Required
          </div>
          <h2 className="text-2xl font-bold font-display tracking-wide text-white">
            {getLimitTitle()}
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
            {errorInfo?.message || "Unlock higher execution limits, larger file uploads, persistent webhooks, and custom LLMs."}
          </p>
        </div>

        {/* Tier Upgrade Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
          {/* Analyst Card */}
          <div className="relative p-5 glass-card border border-neon-cyan/40 hover:border-neon-cyan transition-all flex flex-col justify-between rounded-xl bg-slate-900/60">
            <div className="absolute -top-3 right-4 px-2 py-0.5 bg-neon-cyan text-slate-950 text-[10px] font-bold font-mono rounded uppercase tracking-wider">
              Most Popular
            </div>
            <div>
              <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
                🚀 Analyst
              </h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-extrabold text-white">$19</span>
                <span className="text-slate-400 text-xs font-mono"> / month</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-300 font-mono mb-4">
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan">✓</span> 200 uploads / month (50 MB)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan">✓</span> Unlimited Pipeline Runs
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan">✓</span> 200 AI Pipeline Generations
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan">✓</span> Up to 20 Saved Webhooks
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan">✓</span> Custom LLMs (OpenAI, Anthropic)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan">✓</span> 7-Day Session Retention
                </li>
              </ul>
            </div>

            <Button
              variant="primary"
              className="w-full justify-center"
              onClick={() => handleUpgrade("analyst")}
              disabled={loadingTier !== null}
              id="upgrade-analyst-btn"
            >
              {loadingTier === "analyst" ? "Redirecting to Stripe..." : "Upgrade to Analyst"}
            </Button>
          </div>

          {/* Studio Card */}
          <div className="relative p-5 glass-card border border-purple-500/40 hover:border-purple-400 transition-all flex flex-col justify-between rounded-xl bg-slate-900/60">
            <div>
              <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
                ⚡ Studio
              </h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-extrabold text-white">$79</span>
                <span className="text-slate-400 text-xs font-mono"> / month</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-300 font-mono mb-4">
                <li className="flex items-center gap-2">
                  <span className="text-purple-400">✓</span> Unlimited Uploads (200 MB)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400">✓</span> Unlimited Pipeline Runs & AI
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400">✓</span> Unlimited Saved Webhooks
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400">✓</span> 2M Daily LLM Tokens
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400">✓</span> Priority Execution Queue
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400">✓</span> 30-Day Session Retention
                </li>
              </ul>
            </div>

            <Button
              variant="secondary"
              className="w-full justify-center text-purple-300 border-purple-500/50 hover:border-purple-400"
              onClick={() => handleUpgrade("studio")}
              disabled={loadingTier !== null}
              id="upgrade-studio-btn"
            >
              {loadingTier === "studio" ? "Redirecting to Stripe..." : "Upgrade to Studio"}
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-400 font-mono transition-colors cursor-pointer"
          >
            Cancel and stay on free Explorer tier
          </button>
        </div>
      </div>
    </div>
  );
}
