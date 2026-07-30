import React, { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight, Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { submitWaitlistEmail } from "../lib/api";

interface WaitlistFormProps {
  onAlreadyHaveAccount?: () => void;
}

export const WaitlistForm: React.FC<WaitlistFormProps> = ({ onAlreadyHaveAccount }) => {
  const [email, setEmail] = useState("");
  const [useCase, setUseCase] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const emailClean = email.trim();
    if (!emailClean || !emailClean.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await submitWaitlistEmail(emailClean, useCase.trim() || undefined, "landing_page");
      setSubmitted(true);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err.message || "Failed to join waitlist. Please try again.";
      setErrorMsg(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg mx-auto bg-[#12161F]/90 border border-cyan-500/40 rounded-2xl p-6 sm:p-8 text-left shadow-[0_0_40px_rgba(77,217,196,0.15)] relative overflow-hidden"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-300">
              Waitlist Entry Confirmed
            </div>
            <h3 className="text-xl font-bold font-display text-[#E7E9EE]">
              You're on the list — we'll email you when you're in!
            </h3>
            <p className="text-sm font-sans text-[#8B92A3] leading-relaxed">
              We've reserved your spot for <span className="text-[#E7E9EE] font-medium">{email}</span>. Look out for an invitation email from our team as we approve new accounts daily.
            </p>
          </div>
        </div>

        {onAlreadyHaveAccount && (
          <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center text-xs font-mono">
            <span className="text-[#8B92A3]">Already have an approved account?</span>
            <button
              onClick={onAlreadyHaveAccount}
              className="text-[#4DD9C4] hover:text-[#4DD9C4]/80 font-semibold underline underline-offset-4 transition-colors"
            >
              Sign In →
            </button>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      id="waitlist-form"
      className="w-full max-w-lg mx-auto bg-[#12161F]/90 border border-slate-800 hover:border-cyan-500/30 rounded-2xl p-6 sm:p-8 text-left shadow-2xl transition-all"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#F5A623]" />
          <span className="font-mono text-xs font-semibold text-[#F5A623] uppercase tracking-wider">
            Early Access Waitlist
          </span>
        </div>
        {onAlreadyHaveAccount && (
          <button
            onClick={onAlreadyHaveAccount}
            type="button"
            className="text-xs font-mono text-[#8B92A3] hover:text-[#E7E9EE] transition-colors"
          >
            Have an account? <span className="text-[#4DD9C4] underline">Sign In</span>
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-mono text-[#8B92A3] mb-1.5">
            Work Email Address <span className="text-rose-400">*</span>
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full px-4 py-3 rounded-xl bg-[#0B0E14] border border-slate-700/80 focus:border-[#4DD9C4] focus:ring-1 focus:ring-[#4DD9C4] text-[#E7E9EE] placeholder:text-[#52596A] text-sm font-sans outline-none transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-mono text-[#8B92A3] mb-1.5">
            What would you use Glasswork for? <span className="text-slate-500">(Optional)</span>
          </label>
          <textarea
            rows={2}
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
            placeholder="e.g. Automating monthly sales CSV reports, clean financial data..."
            className="w-full px-4 py-2.5 rounded-xl bg-[#0B0E14] border border-slate-700/80 focus:border-[#4DD9C4] focus:ring-1 focus:ring-[#4DD9C4] text-[#E7E9EE] placeholder:text-[#52596A] text-sm font-sans outline-none transition-all resize-none"
          />
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-6 rounded-xl bg-[#F5A623] hover:bg-[#f5a623]/90 text-[#0B0E14] font-mono text-sm font-bold transition-all shadow-[0_0_20px_rgba(245,166,35,0.4)] hover:shadow-[0_0_30px_rgba(245,166,35,0.6)] active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-[#0B0E14]" />
              <span>Submitting...</span>
            </>
          ) : (
            <>
              <span>Join the Waitlist</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
};
