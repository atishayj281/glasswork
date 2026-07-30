import React, { useState } from "react";
import Button from "../components/ui/Button";
import type { TierName } from "../types";
import { submitWaitlistEmail } from "../lib/api";

interface PricingPageProps {
  currentTier?: TierName | string;
  isAuthenticated?: boolean;
  onCheckout: (tier: "analyst" | "studio") => Promise<void>;
  onNavigateStudio: () => void;
  onNavigateLanding?: () => void;
}

export default function PricingPage({ onNavigateStudio, onNavigateLanding }: PricingPageProps) {
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
      await submitWaitlistEmail(email.trim(), "pricing_page");
      setSubmitted(true);
    } catch (err: any) {
      console.error("Waitlist error:", err);
      setErrorMsg(err.response?.data?.detail || "Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const tiers = [
    {
      name: "Explorer",
      label: "Free Forever",
      color: "slate",
      borderClass: "border-slate-700/60",
      badgeClass: "text-slate-400",
      icon: "🔭",
      teaser: "Ideal for personal projects and quick data exploration.",
    },
    {
      name: "Analyst",
      label: "Pro Analyst",
      color: "cyan",
      borderClass: "border-neon-cyan/40",
      badgeClass: "text-neon-cyan",
      icon: "🚀",
      teaser: "Unlimited runs, custom LLMs, and persistent webhook pipelines.",
      highlight: true,
    },
    {
      name: "Studio",
      label: "Team / Enterprise",
      color: "purple",
      borderClass: "border-purple-500/30",
      badgeClass: "text-purple-400",
      icon: "⚡",
      teaser: "Multi-seat collaboration, priority queues, and maximum scale.",
    },
  ];

  return (
    <div className="min-h-screen grid-bg text-white py-12 px-6 font-sans flex flex-col">
      {/* Nav */}
      <div className="max-w-6xl mx-auto w-full mb-10">
        <button
          onClick={onNavigateLanding ?? onNavigateStudio}
          className="flex items-center gap-2 text-xs font-mono text-slate-400 hover:text-neon-cyan transition-colors cursor-pointer"
        >
          {onNavigateLanding ? "← Back to Landing Page" : "← Return to Glasswork Studio"}
        </button>
      </div>

      {/* Hero */}
      <div className="max-w-3xl mx-auto w-full text-center space-y-6 flex-1 flex flex-col items-center justify-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-xs font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
          Pricing — Coming Soon
        </div>

        <h1 className="text-5xl md:text-6xl font-extrabold font-display tracking-tight gradient-text leading-tight">
          Powerful plans,<br />launching soon.
        </h1>

        <p className="text-slate-400 text-sm font-mono leading-relaxed max-w-xl">
          We're putting the finishing touches on our subscription tiers. Leave your email and you'll be the first to know — plus get early-access pricing.
        </p>

        {/* Email capture */}
        {!submitted ? (
          <div className="w-full max-w-md mt-2 space-y-2">
            <form
              onSubmit={handleNotify}
              className="flex flex-col sm:flex-row items-center gap-3 w-full"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                className="flex-1 w-full px-4 py-2.5 rounded-lg bg-slate-900/80 border border-slate-700 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:border-neon-cyan/60 transition-colors disabled:opacity-50"
              />
              <Button variant="primary" type="submit" disabled={loading} className="whitespace-nowrap w-full sm:w-auto justify-center">
                {loading ? "Submitting..." : "Notify Me"}
              </Button>
            </form>
            {errorMsg && (
              <p className="text-xs text-red-400 font-mono text-left">{errorMsg}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-mono">
            <span>✓</span>
            <span>You're on the list! We'll reach out to <strong>{email}</strong>.</span>
          </div>
        )}

        {/* Tier preview cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-10">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative p-6 glass-panel rounded-2xl border ${t.borderClass} flex flex-col items-center text-center gap-3 transition-all ${
                t.highlight ? "shadow-[0_0_30px_rgba(34,211,238,0.08)]" : ""
              }`}
            >
              {t.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-neon-cyan text-slate-950 text-[11px] font-bold font-mono rounded-full uppercase tracking-wider shadow-lg">
                  Most Popular
                </div>
              )}
              <span className="text-3xl">{t.icon}</span>
              <div>
                <span className={`text-[10px] font-mono uppercase tracking-widest ${t.badgeClass}`}>{t.label}</span>
                <h2 className="text-xl font-bold font-display text-white mt-0.5">{t.name}</h2>
              </div>
              <p className="text-xs text-slate-500 font-mono leading-relaxed">{t.teaser}</p>
              <div className="mt-2 px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700/50 text-[10px] font-mono text-slate-500 tracking-widest uppercase">
                Coming Soon
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="text-center mt-16 pb-4 text-xs text-slate-600 font-mono">
        All current users continue on the free Explorer tier with no action required.
      </div>
    </div>
  );
}
