import React from "react";
import TierBadge from "../components/TierBadge";
import Button from "../components/ui/Button";
import type { BillingSubscription } from "../types";

interface BillingPageProps {
  billing: BillingSubscription | null;
  loading: boolean;
  onOpenPortal: () => Promise<void>;
  onNavigatePricing: () => void;
  onNavigateStudio: () => void;
}

export default function BillingPage({
  billing,
  loading,
  onOpenPortal,
  onNavigatePricing,
  onNavigateStudio,
}: BillingPageProps) {
  if (loading || !billing) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="text-center font-mono text-neon-cyan animate-pulse">
          Loading billing information...
        </div>
      </div>
    );
  }

  const { tier, tier_label, stripe_status, current_period_end, limits, usage_this_period } = billing;

  const renderMeter = (
    label: string,
    current: number,
    max: number | null,
    unit: string = ""
  ) => {
    const isUnlimited = max === null;
    const percentage = isUnlimited ? 0 : Math.min(100, Math.round((current / max) * 100));

    return (
      <div className="space-y-2 p-4 glass-card border border-slate-800">
        <div className="flex justify-between items-center text-xs font-mono">
          <span className="text-slate-400">{label}</span>
          <span className="text-white font-bold">
            {current.toLocaleString()} {unit} / {isUnlimited ? "Unlimited" : `${max.toLocaleString()} ${unit}`}
          </span>
        </div>
        {!isUnlimited && (
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                percentage >= 90
                  ? "bg-red-500"
                  : percentage >= 75
                  ? "bg-amber-400"
                  : "bg-neon-cyan"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen grid-bg text-white py-10 px-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={onNavigateStudio}
            className="flex items-center gap-2 text-xs font-mono text-slate-400 hover:text-neon-cyan transition-colors"
          >
            ← Return to Studio
          </button>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={onNavigatePricing}>
              View All Plans & Features
            </Button>
          </div>
        </div>

        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold font-display tracking-wide gradient-text">
            Subscription & Usage
          </h1>
          <p className="text-slate-400 text-sm font-mono mt-1">
            Manage your plan, check usage quotas, and manage billing details via Stripe.
          </p>
        </div>

        {/* Overview Banner */}
        <div className="p-6 glass-panel rounded-2xl border border-neon-cyan/30 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold font-display text-white">{tier_label} Plan</h2>
              <TierBadge tier={tier} showUpgradeBtn={false} />
            </div>
            <p className="text-xs font-mono text-slate-400">
              Status:{" "}
              <span
                className={`font-semibold capitalize ${
                  stripe_status === "active"
                    ? "text-emerald-400"
                    : stripe_status === "past_due"
                    ? "text-amber-400"
                    : "text-slate-400"
                }`}
              >
                {stripe_status || (tier === "explorer" ? "Free Tier" : "Active")}
              </span>
              {current_period_end && (
                <span className="ml-4">
                  Renews: {new Date(current_period_end).toLocaleDateString()}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {tier === "explorer" ? (
              <Button variant="primary" onClick={onNavigatePricing} id="upgrade-plan-btn">
                Upgrade Plan
              </Button>
            ) : (
              <Button variant="secondary" onClick={onOpenPortal} id="manage-stripe-btn">
                Manage Subscription (Stripe)
              </Button>
            )}
          </div>
        </div>

        {/* Usage Quotas */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold font-display text-white">Monthly Quotas & Usage</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderMeter("Uploads (30 days)", usage_this_period.uploads, limits.max_uploads_per_month)}
            {renderMeter("Pipeline Runs (30 days)", usage_this_period.pipeline_runs, limits.max_pipeline_runs_per_month)}
            {renderMeter("AI Generations (30 days)", usage_this_period.pipeline_generations, limits.max_pipeline_generations_per_month)}
            {renderMeter("Saved Pipelines & Webhooks", usage_this_period.uploads, limits.max_saved_pipelines)}
            {renderMeter("Daily Tokens", usage_this_period.daily_tokens, limits.max_daily_tokens, "tokens")}
          </div>
        </div>

        {/* Tier Limits Overview */}
        <div className="p-6 glass-panel rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-lg font-bold font-display text-white">Plan Features</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <span className="text-slate-500 block">Max File Upload Size</span>
              <span className="text-white font-bold text-sm">{limits.max_file_size_mb} MB</span>
            </div>
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <span className="text-slate-500 block">Session Data Retention</span>
              <span className="text-white font-bold text-sm">{limits.session_retention_days} Days</span>
            </div>
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <span className="text-slate-500 block">LLM Provider Access</span>
              <span className="text-white font-bold text-sm">
                {limits.allowed_llm_providers.join(", ")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
