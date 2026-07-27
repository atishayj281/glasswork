import { useState } from "react";
import type { FirebaseError } from "firebase/app";
import { useAuth } from "../hooks/useAuth";

interface AuthPageProps {
  onAuthSuccess?: () => void;
  contextMessage?: string;
  onNavigateBack?: () => void;
}

export default function AuthPage({ onAuthSuccess, contextMessage, onNavigateBack }: AuthPageProps = {}) {
  const { login, register, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
      onAuthSuccess?.();
    } catch (err) {
      const fe = err as FirebaseError;
      setError(fe.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
      onAuthSuccess?.();
    } catch (err) {
      const fe = err as FirebaseError;
      setError(fe.message ?? "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center grid-bg overflow-hidden">
      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-neon-violet/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-neon-cyan/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="w-full max-w-md px-6 relative z-10">
        {/* Back navigation */}
        {onNavigateBack && (
          <button
            onClick={onNavigateBack}
            className="flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors mb-6"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Landing Page
          </button>
        )}

        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl font-bold tracking-[0.3em] gradient-text mb-2">
            GLASSWORK
          </h1>
          <p className="font-mono text-xs text-slate-500 tracking-widest uppercase">
            Agentic Data Platform
          </p>
        </div>

        {/* Card */}
        <div className="glass-panel rounded-2xl p-8 border border-slate-700/50 shadow-2xl">
          {/* Upgrade intent banner */}
          {contextMessage && (
            <div className="flex items-start gap-2 mb-6 p-3 rounded-xl bg-[#F5A623]/10 border border-[#F5A623]/30">
              <svg className="w-4 h-4 text-[#F5A623] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p className="text-xs font-mono text-[#F5A623] leading-relaxed">{contextMessage}</p>
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex bg-slate-800/60 rounded-xl p-1 mb-8">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  mode === m
                    ? "bg-gradient-primary text-white shadow-neon-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 tracking-wider uppercase">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-cyan/60 focus:ring-1 focus:ring-neon-cyan/30 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 tracking-wider uppercase">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-cyan/60 focus:ring-1 focus:ring-neon-cyan/30 transition-all"
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs font-mono bg-red-950/30 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              id="auth-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-primary text-white font-semibold text-sm shadow-neon-sm hover:shadow-neon-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-700/50" />
            <span className="text-xs text-slate-600 font-mono">OR</span>
            <div className="flex-1 h-px bg-slate-700/50" />
          </div>

          {/* Google sign-in */}
          <button
            id="auth-google"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl border border-slate-600/50 bg-slate-800/40 text-slate-300 text-sm font-medium hover:border-slate-500 hover:bg-slate-700/40 transition-all duration-200 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6 font-mono">
          Your pipelines are securely stored and synced across devices
        </p>
      </div>
    </div>
  );
}
