import React, { useState } from "react";
import type { LimitExceededError } from "../types";
import Button from "./ui/Button";
import { submitWaitlistEmail } from "../lib/api";

interface UpgradeModalProps {
  errorInfo?: LimitExceededError | null;
  onClose: () => void;
  onCheckout?: (tier: "analyst" | "studio") => Promise<void>;
}

export default function UpgradeModal({ errorInfo, onClose }: UpgradeModalProps) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleNotify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await submitWaitlistEmail(email.trim(), "upgrade_modal");
      setSubmitted(true);
    } catch (err: any) {
      console.error("Waitlist error:", err);
      setErrorMsg(err.response?.data?.detail || "Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getLimitTitle = () => {
    if (!errorInfo) return "Paid Plans Launching Soon";
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
        return "Quota Limit Reached";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg glass-panel p-6 rounded-2xl border border-neon-cyan/30 shadow-[0_0_50px_rgba(34,211,238,0.15)] overflow-hidden">
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
            <span className="animate-pulse">🚀</span> Paid Plans Launching Soon
          </div>
          <h2 className="text-2xl font-bold font-display tracking-wide text-white">
            {getLimitTitle()}
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto font-mono">
            {errorInfo?.message || "Higher limits, team collaboration, and persistent webhooks are launching soon."}
          </p>
        </div>

        {/* Launching Soon Teaser Card */}
        <div className="p-5 glass-card border border-neon-cyan/30 rounded-xl bg-slate-900/60 my-4 text-center space-y-4">
          <div className="text-xs font-mono text-slate-300">
            We are currently rolling out Analyst & Studio plans. Get notified as soon as upgrades go live to unlock early access pricing!
          </div>

          {!submitted ? (
            <div className="space-y-2">
              <form onSubmit={handleNotify} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-neon-cyan disabled:opacity-50"
                />
                <Button variant="primary" size="sm" type="submit" disabled={loading}>
                  {loading ? "Submitting..." : "Get Notified"}
                </Button>
              </form>
              {errorMsg && (
                <p className="text-xs text-red-400 font-mono text-left">{errorMsg}</p>
              )}
            </div>
          ) : (
            <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-lg">
              ✓ Thanks! We'll notify <strong>{email}</strong> when paid plans launch.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-400 font-mono transition-colors cursor-pointer"
          >
            Close and return to Studio
          </button>
        </div>
      </div>
    </div>
  );
}
