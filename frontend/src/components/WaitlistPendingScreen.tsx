import React from "react";
import { Sparkles, Clock, CheckCircle2, LogOut, Mail, ShieldAlert } from "lucide-react";

interface WaitlistPendingScreenProps {
  userEmail?: string | null;
  onSignOut: () => void;
}

export const WaitlistPendingScreen: React.FC<WaitlistPendingScreenProps> = ({
  userEmail,
  onSignOut,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white relative overflow-hidden">
      {/* Background Decorator Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-indigo-500/15 via-purple-500/5 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Navigation */}
      <header className="max-w-6xl w-full mx-auto px-6 py-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
            Glasswork
          </span>
        </div>

        <button
          onClick={onSignOut}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </button>
      </header>

      {/* Main Content Card */}
      <main className="max-w-xl w-full mx-auto px-6 py-12 flex-1 flex items-center justify-center z-10">
        <div className="w-full bg-slate-900/80 backdrop-blur-xl border border-slate-800/90 rounded-2xl p-8 sm:p-10 shadow-2xl shadow-slate-950/80 relative">
          
          {/* Icon Badge */}
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-6 text-indigo-400 shadow-inner">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Waitlist Status: Pending Approval</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              You're on the waitlist!
            </h1>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
              We are selectively onboarding early access users to ensure system performance and high-quality LLM pipeline generation.
            </p>
          </div>

          {/* Account Details Box */}
          <div className="mt-8 bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-slate-500" />
                Account Email
              </span>
              <span className="font-medium text-slate-200">{userEmail || "Your account"}</span>
            </div>
            <div className="h-px bg-slate-800/50" />
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                Access Request
              </span>
              <span className="text-indigo-300 font-medium">Queued for review</span>
            </div>
          </div>

          {/* Explanation Box */}
          <div className="mt-6 p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-xs sm:text-sm text-indigo-200/90 leading-relaxed flex gap-3">
            <ShieldAlert className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-indigo-200 mb-0.5">What happens next?</p>
              <p className="text-indigo-300/80">
                Our founder reviews new entries daily. Once approved, you will receive an instant email invitation and your account will automatically unlock full product access.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 text-center">
            <button
              onClick={onSignOut}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline underline-offset-4"
            >
              Want to use a different email? Sign out
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-slate-500 z-10">
        &copy; {new Date().getFullYear()} Glasswork. All rights reserved.
      </footer>
    </div>
  );
};

export default WaitlistPendingScreen;
