import React from "react";
import { motion } from "framer-motion";
import Navbar from "./Navbar";
import HeroPipeline from "./HeroPipeline";
import PrivacySection from "./PrivacySection";
import HowItWorks from "./HowItWorks";
import OperationsGrid from "./OperationsGrid";
import ProviderStrip from "./ProviderStrip";
import { Play } from "lucide-react";

interface LandingPageProps {
  onLaunchStudio: () => void;
  onViewPricing?: () => void;
}

export default function LandingPage({ onLaunchStudio, onViewPricing }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#E7E9EE] font-sans selection:bg-[#4DD9C4]/30 selection:text-[#4DD9C4]">
      {/* Instrumentation Ambient Grid Background */}
      <div className="fixed inset-0 bg-grid-pattern opacity-20 pointer-events-none z-0" />

      {/* Sticky Telemetry Navbar */}
      <Navbar onLaunchStudio={onLaunchStudio} onViewPricing={onViewPricing} />

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-8 pb-20">
        
        {/* HERO SECTION */}
        <section className="text-center pt-8 pb-12">
          
          {/* Eyebrow badge */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#12161F] border border-cyan-500/30 text-xs font-mono text-[#4DD9C4] mb-6 shadow-md"
          >
            <span className="w-2 h-2 rounded-full bg-[#F5A623] animate-pulse" />
            <span>Agentic Data Analysis Engine</span>
            <span className="text-[#8B92A3]">|</span>
            <span className="text-[#8B92A3]">React Flow DAG + Pandas</span>
          </motion.div>

          {/* Headline stating exact mechanism (No generic SaaS filler) */}
          <motion.h1 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="font-display text-4xl sm:text-6xl font-bold tracking-tight text-[#E7E9EE] max-w-4xl mx-auto leading-[1.1]"
          >
            Chat in plain language. <br />
            Watch an <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4DD9C4] via-[#F5A623] to-[#4DD9C4]">editable DAG pipeline</span> assemble live.
          </motion.h1>

          {/* Direct plain copy */}
          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="text-lg sm:text-xl text-[#8B92A3] max-w-2xl mx-auto mt-6 font-sans leading-relaxed"
          >
            Upload a CSV or Excel file. Chat with the agent about what you want to calculate. 
            Glasswork generates a transparent data processing pipeline where every step is visible, editable, and re-runnable.
          </motion.p>

          {/* Action CTAs */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8"
          >
            {/* Primary Amber Solid CTA */}
            <button
              onClick={onLaunchStudio}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-[#F5A623] hover:bg-[#f5a623]/90 text-[#0B0E14] font-mono text-sm font-bold transition-all shadow-[0_0_25px_rgba(245,166,35,0.4)] hover:shadow-[0_0_35px_rgba(245,166,35,0.6)] active:scale-95 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]"
            >
              <Play className="w-4 h-4 fill-[#0B0E14]" />
              <span>Try Glasswork Studio — Upload File</span>
            </button>

            {/* Secondary Ghost CTA */}
            <a
              href="https://github.com/atishayj281/aegis-pipeline-studio"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-cyan-500/30 bg-[#12161F] hover:bg-[#12161F]/90 hover:border-[#4DD9C4] text-[#E7E9EE] font-mono text-sm font-semibold transition-all flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]"
            >
              <svg className="w-4 h-4 text-[#8B92A3] fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>View Source on GitHub</span>
            </a>
          </motion.div>

          {/* SIGNATURE ELEMENT: Live Ambient Animated Pipeline Diagram Centerpiece */}
          <div className="mt-12">
            <HeroPipeline />
          </div>
        </section>

        {/* PRIVACY CALLOUT SECTION */}
        <PrivacySection />

        {/* HOW IT WORKS SECTION */}
        <HowItWorks />

        {/* PIPELINE OPERATIONS GRID */}
        <OperationsGrid />

        {/* LITELLM PROVIDER-AGNOSTIC STRIP */}
        <ProviderStrip />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PRICING SECTION                                                     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <motion.section
          id="pricing"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          className="my-20 scroll-mt-24"
        >
          {/* Section header */}
          <div className="text-center mb-12 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#12161F] border border-cyan-500/30 text-xs font-mono text-[#4DD9C4] shadow-md">
              <span>💎</span> Simple, Transparent Pricing
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#E7E9EE]">
              Plans for every data workflow
            </h2>
            <p className="text-sm text-[#8B92A3] font-mono max-w-xl mx-auto leading-relaxed">
              From quick one-off transforms to automated pipeline APIs — pick the tier that fits your scale.
            </p>
          </div>

          {/* 3-column tier grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">

            {/* ─── Explorer (Free) ─────────────────────────────────────────── */}
            <div className="p-6 rounded-2xl bg-[#12161F] border border-slate-700/60 flex flex-col justify-between hover:border-slate-500/80 transition-all">
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-mono text-[#8B92A3] uppercase tracking-widest">Free Forever</span>
                  <h3 className="text-2xl font-bold font-display text-[#E7E9EE] mt-1">Explorer</h3>
                </div>
                <div>
                  <span className="text-4xl font-extrabold text-[#E7E9EE]">$0</span>
                  <span className="text-[#8B92A3] text-xs font-mono"> / month</span>
                </div>
                <p className="text-xs text-[#8B92A3] font-mono">
                  Perfect for quick data cleanup, single-file processing, and testing Glasswork pipelines.
                </p>
                <hr className="border-slate-800" />
                <ul className="space-y-2.5 text-xs font-mono text-slate-300">
                  {[
                    "10 Uploads / month",
                    "Max 10 MB file size",
                    "20 Pipeline Runs / month",
                    "Default LLM model only",
                    "24h Session retention",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="text-emerald-400 shrink-0">✓</span>{f}
                    </li>
                  ))}
                  <li className="flex items-center gap-2 text-slate-500">
                    <span className="shrink-0">✕</span>No persistent saved webhooks
                  </li>
                </ul>
              </div>
              <div className="pt-6">
                <button
                  onClick={onLaunchStudio}
                  className="w-full py-2.5 rounded-xl border border-slate-600 hover:border-slate-400 text-[#E7E9EE] font-mono text-xs font-semibold transition-all"
                >
                  Get Started Free
                </button>
              </div>
            </div>

            {/* ─── Analyst (Most Popular) ──────────────────────────────────── */}
            <div className="relative p-6 rounded-2xl bg-[#0d1a1a] border border-[#4DD9C4]/60 hover:border-[#4DD9C4] flex flex-col justify-between transition-all shadow-[0_0_30px_rgba(77,217,196,0.12)]">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#4DD9C4] text-[#0B0E14] text-[11px] font-bold font-mono rounded-full uppercase tracking-wider shadow-lg whitespace-nowrap">
                Most Popular
              </div>
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-mono text-[#4DD9C4] uppercase tracking-widest">Pro Analyst</span>
                  <h3 className="text-2xl font-bold font-display text-[#E7E9EE] mt-1">Analyst</h3>
                </div>
                <div>
                  <span className="text-4xl font-extrabold text-[#E7E9EE]">$19</span>
                  <span className="text-[#8B92A3] text-xs font-mono"> / month</span>
                </div>
                <p className="text-xs text-[#8B92A3] font-mono">
                  For data professionals needing unlimited runs, larger uploads, and custom LLMs.
                </p>
                <hr className="border-[#4DD9C4]/20" />
                <ul className="space-y-2.5 text-xs font-mono text-slate-200">
                  {[
                    "200 Uploads / month",
                    "50 MB max file size",
                    "Unlimited Pipeline Runs",
                    "200 AI Pipeline Generations",
                    "OpenAI / Anthropic / Ollama",
                    "20 Saved Webhook Pipelines",
                    "7-Day Session Retention",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="text-[#4DD9C4] font-bold shrink-0">✓</span>{f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-6">
                <button
                  onClick={onViewPricing ?? onLaunchStudio}
                  className="w-full py-2.5 rounded-xl bg-[#4DD9C4] hover:bg-[#4DD9C4]/90 text-[#0B0E14] font-mono text-xs font-bold transition-all shadow-[0_0_20px_rgba(77,217,196,0.3)] hover:shadow-[0_0_30px_rgba(77,217,196,0.5)] active:scale-[0.98]"
                >
                  Upgrade to Analyst → $19/mo
                </button>
              </div>
            </div>

            {/* ─── Studio (Enterprise) ─────────────────────────────────────── */}
            <div className="p-6 rounded-2xl bg-[#130e1a] border border-purple-500/30 hover:border-purple-400/60 flex flex-col justify-between transition-all shadow-[0_0_30px_rgba(167,139,250,0.08)]">
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-mono text-purple-400 uppercase tracking-widest">Team / Enterprise</span>
                  <h3 className="text-2xl font-bold font-display text-[#E7E9EE] mt-1">Studio</h3>
                </div>
                <div>
                  <span className="text-4xl font-extrabold text-[#E7E9EE]">$79</span>
                  <span className="text-[#8B92A3] text-xs font-mono"> / month</span>
                </div>
                <p className="text-xs text-[#8B92A3] font-mono">
                  Unlimited power, high file-size caps, priority execution, and maximum retention.
                </p>
                <hr className="border-purple-500/20" />
                <ul className="space-y-2.5 text-xs font-mono text-slate-200">
                  {[
                    "Unlimited Uploads",
                    "200 MB max file size",
                    "Unlimited Pipeline Runs",
                    "Unlimited AI Generations",
                    "Unlimited Saved Webhooks",
                    "Priority Execution Queue",
                    "30-Day Session Retention",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="text-purple-400 font-bold shrink-0">✓</span>{f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-6">
                <button
                  onClick={onViewPricing ?? onLaunchStudio}
                  className="w-full py-2.5 rounded-xl border border-purple-500/50 hover:border-purple-400 text-purple-300 hover:text-purple-200 font-mono text-xs font-semibold transition-all hover:bg-purple-500/10"
                >
                  Upgrade to Studio → $79/mo
                </button>
              </div>
            </div>

          </div>

          {/* FAQ micro-section */}
          <div className="mt-10 text-center space-y-1">
            <p className="text-xs font-mono text-[#8B92A3]">
              All plans include a <span className="text-[#4DD9C4]">14-day free trial</span>. Cancel any time. No credit card required for Explorer.
            </p>
            <button
              onClick={onViewPricing ?? onLaunchStudio}
              className="text-xs font-mono text-[#8B92A3] underline underline-offset-2 hover:text-[#E7E9EE] transition-colors"
            >
              View full plan comparison →
            </button>
          </div>
        </motion.section>

        {/* CLOSING CTA BLOCK */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3 }}
          className="my-20 p-8 sm:p-12 rounded-2xl bg-[#12161F] border border-cyan-500/30 text-center relative overflow-hidden shadow-2xl"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#F5A623]/5 rounded-full blur-3xl pointer-events-none" />

          <span className="font-mono text-xs text-[#F5A623] uppercase tracking-widest font-semibold block mb-2">
            TRANSPARENT AGENTIC DATA ENGINE
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#E7E9EE] tracking-tight">
            Stop guessing what the AI calculated under the hood.
          </h2>
          <p className="text-sm sm:text-base text-[#8B92A3] max-w-xl mx-auto mt-3 font-sans leading-relaxed">
            Upload your CSV or Excel file, converse with the agent, and inspect every step of the generated DAG pipeline.
          </p>

          <div className="mt-8 flex justify-center">
            <button
              onClick={onLaunchStudio}
              className="px-8 py-4 rounded-xl bg-[#F5A623] hover:bg-[#f5a623]/90 text-[#0B0E14] font-mono text-sm font-bold transition-all shadow-[0_0_30px_rgba(245,166,35,0.4)] hover:shadow-[0_0_40px_rgba(245,166,35,0.7)] active:scale-95 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]"
            >
              <Play className="w-4 h-4 fill-[#0B0E14]" />
              <span>Launch Glasswork Studio</span>
            </button>
          </div>
        </motion.section>

      </main>

      {/* Control Room Footer */}
      <footer className="border-t border-cyan-500/15 py-8 bg-[#0B0E14] text-xs font-mono text-[#8B92A3]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[#E7E9EE] font-bold">GLASSWORK</span>
            <span>— Agentic Data Analysis</span>
          </div>
          <div>
            <span>Backend: FastAPI + Pandas + LiteLLM • Frontend: React + React Flow</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
