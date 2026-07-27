import React, { useState } from "react";
import Button from "../components/ui/Button";
import type { TierName } from "../types";

interface PricingPageProps {
  currentTier?: TierName | string;
  isAuthenticated?: boolean;
  onCheckout: (tier: "analyst" | "studio") => Promise<void>;
  onNavigateStudio: () => void;
  onNavigateLanding?: () => void;
}

export default function PricingPage({ currentTier = "explorer", isAuthenticated = true, onCheckout, onNavigateStudio, onNavigateLanding }: PricingPageProps) {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const handleSelectTier = async (tier: "analyst" | "studio") => {
    try {
      setLoadingTier(tier);
      await onCheckout(tier);
    } catch (err) {
      console.error("Checkout failed:", err);
      setLoadingTier(null);
    }
  };

  const isCurrent = (t: string) => currentTier.toLowerCase() === t.toLowerCase();

  return (
    <div className="min-h-screen grid-bg text-white py-12 px-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={onNavigateLanding ?? onNavigateStudio}
            className="flex items-center gap-2 text-xs font-mono text-slate-400 hover:text-neon-cyan transition-colors cursor-pointer"
          >
            {onNavigateLanding ? "← Back to Landing Page" : "← Return to Glasswork Studio"}
          </button>
          {isAuthenticated && (
            <div className="text-xs font-mono text-slate-500">
              Current Tier: <span className="text-neon-cyan uppercase font-bold">{currentTier}</span>
            </div>
          )}
        </div>

        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-xs font-mono">
            <span>💎</span> Simple, Transparent Pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold font-display tracking-tight gradient-text">
            Choose the plan that fits your data workflow
          </h1>
          <p className="text-slate-400 text-sm font-mono leading-relaxed">
            Scale seamlessly from basic data transformation to enterprise-grade automated pipelines with webhook integration.
          </p>
        </div>

        {/* 3 Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {/* Explorer Tier */}
          <div className={`p-6 glass-panel rounded-2xl border flex flex-col justify-between transition-all ${
            isCurrent("explorer") ? "border-slate-500 shadow-md" : "border-slate-800"
          }`}>
            <div className="space-y-4">
              <div>
                <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Free Forever</span>
                <h2 className="text-2xl font-bold font-display text-white mt-1">Explorer</h2>
              </div>
              <div>
                <span className="text-4xl font-extrabold text-white">$0</span>
                <span className="text-slate-400 text-xs font-mono"> / month</span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Perfect for quick data cleanup, single-file processing, and testing Glasswork pipelines.
              </p>

              <hr className="border-slate-800" />

              <ul className="space-y-3 text-xs font-mono text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> 10 Uploads / month
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> Max 10 MB file size
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> 20 Pipeline Runs / month
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> Default LLM model only
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> 24h Session retention
                </li>
                <li className="flex items-center gap-2 text-slate-500">
                  <span>✕</span> No persistent saved webhooks
                </li>
              </ul>
            </div>

            <div className="pt-6">
              {isCurrent("explorer") ? (
                <Button variant="secondary" className="w-full justify-center" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button variant="secondary" className="w-full justify-center" onClick={onNavigateStudio}>
                  Use Free Tier
                </Button>
              )}
            </div>
          </div>

          {/* Analyst Tier */}
          <div className={`relative p-6 glass-panel rounded-2xl border flex flex-col justify-between transition-all bg-slate-900/80 ${
            isCurrent("analyst") ? "border-neon-cyan shadow-[0_0_30px_rgba(34,211,238,0.2)]" : "border-neon-cyan/50 hover:border-neon-cyan"
          }`}>
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-neon-cyan text-slate-950 text-[11px] font-bold font-mono rounded-full uppercase tracking-wider shadow-lg">
              Most Popular
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-xs font-mono text-neon-cyan uppercase tracking-widest">Pro Analyst</span>
                <h2 className="text-2xl font-bold font-display text-white mt-1">Analyst</h2>
              </div>
              <div>
                <span className="text-4xl font-extrabold text-white">$19</span>
                <span className="text-slate-400 text-xs font-mono"> / month</span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Designed for data professionals needing unlimited execution runs, larger uploads, and custom LLMs.
              </p>

              <hr className="border-neon-cyan/20" />

              <ul className="space-y-3 text-xs font-mono text-slate-200">
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan font-bold">✓</span> 200 Uploads / month
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan font-bold">✓</span> 50 MB max file size
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan font-bold">✓</span> Unlimited Pipeline Runs
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan font-bold">✓</span> 200 AI Pipeline Generations
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan font-bold">✓</span> Choice of OpenAI, Anthropic, Ollama
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan font-bold">✓</span> 20 Saved Webhook Pipelines
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-neon-cyan font-bold">✓</span> 7-Day Session Retention
                </li>
              </ul>
            </div>

            <div className="pt-6">
              {isCurrent("analyst") ? (
                <Button variant="secondary" className="w-full justify-center" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  onClick={() => handleSelectTier("analyst")}
                  disabled={loadingTier !== null}
                  id="pricing-analyst-btn"
                >
                  {loadingTier === "analyst"
                    ? "Redirecting..."
                    : isAuthenticated
                    ? "Upgrade to Analyst"
                    : "Sign up & upgrade to Analyst"}
                </Button>
              )}
            </div>
          </div>

          {/* Studio Tier */}
          <div className={`p-6 glass-panel rounded-2xl border flex flex-col justify-between transition-all bg-purple-950/20 ${
            isCurrent("studio") ? "border-purple-400 shadow-[0_0_30px_rgba(167,139,250,0.2)]" : "border-purple-500/30 hover:border-purple-400"
          }`}>
            <div className="space-y-4">
              <div>
                <span className="text-xs font-mono text-purple-400 uppercase tracking-widest">Team / Enterprise</span>
                <h2 className="text-2xl font-bold font-display text-white mt-1">Studio</h2>
              </div>
              <div>
                <span className="text-4xl font-extrabold text-white">$79</span>
                <span className="text-slate-400 text-xs font-mono"> / month</span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                For teams needing unlimited power, high file size caps, priority processing, and maximum retention.
              </p>

              <hr className="border-purple-500/20" />

              <ul className="space-y-3 text-xs font-mono text-slate-200">
                <li className="flex items-center gap-2">
                  <span className="text-purple-400 font-bold">✓</span> Unlimited Uploads
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400 font-bold">✓</span> 200 MB max file size
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400 font-bold">✓</span> Unlimited Pipeline Runs
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400 font-bold">✓</span> Unlimited AI Pipeline Generations
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400 font-bold">✓</span> Unlimited Saved Webhook Pipelines
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400 font-bold">✓</span> Priority Execution Queue
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-400 font-bold">✓</span> 30-Day Session Retention
                </li>
              </ul>
            </div>

            <div className="pt-6">
              {isCurrent("studio") ? (
                <Button variant="secondary" className="w-full justify-center" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  className="w-full justify-center text-purple-300 border-purple-500/50 hover:border-purple-400"
                  onClick={() => handleSelectTier("studio")}
                  disabled={loadingTier !== null}
                  id="pricing-studio-btn"
                >
                  {loadingTier === "studio"
                    ? "Redirecting..."
                    : isAuthenticated
                    ? "Upgrade to Studio"
                    : "Sign up & upgrade to Studio"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
