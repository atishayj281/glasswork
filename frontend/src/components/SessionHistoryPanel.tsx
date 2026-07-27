import { useEffect, useState, useCallback } from "react";
import type { SessionSummary } from "../types";
import { listSessions } from "../lib/api";

interface Props {
  currentSessionId: string | null;
  onResume: (sessionId: string) => void;
  onClose: () => void;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined });
}

function FileIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function PipelineIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

export default function SessionHistoryPanel({ currentSessionId, onResume, onClose }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSessions();
      setSessions(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load session history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleResume = async (s: SessionSummary) => {
    if (s.session_id === currentSessionId) {
      onClose();
      return;
    }
    setResumingId(s.session_id);
    try {
      onResume(s.session_id);
    } finally {
      setResumingId(null);
    }
  };

  // Group sessions by calendar day label
  const grouped: { label: string; items: SessionSummary[] }[] = [];
  let lastLabel = "";
  for (const s of sessions) {
    const d = new Date(s.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    let label: string;
    if (d.toDateString() === today.toDateString()) label = "Today";
    else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
    else label = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

    if (label !== lastLabel) {
      grouped.push({ label, items: [] });
      lastLabel = label;
    }
    grouped[grouped.length - 1].items.push(s);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside className="fixed left-0 top-0 bottom-0 z-50 w-80 flex flex-col glass-panel border-r border-slate-700/60 shadow-2xl animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 shrink-0">
          <div>
            <h2 className="font-display text-sm font-bold gradient-text tracking-widest uppercase">
              Session History
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Resume any previous workspace
            </p>
          </div>
          <button
            id="session-history-close"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-800"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-3 space-y-1 min-h-0">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
              <p className="text-xs text-slate-500 font-mono">Loading sessions…</p>
            </div>
          )}

          {!loading && error && (
            <div className="mx-4 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300 font-mono">
              {error}
              <button
                onClick={fetch}
                className="block mt-2 text-red-400 hover:text-red-200 underline"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-2xl">
                🗂️
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-300">No sessions yet</p>
                <p className="text-xs text-slate-500 font-mono mt-1">
                  Upload a file to start your first session
                </p>
              </div>
            </div>
          )}

          {!loading && !error && grouped.map(({ label, items }) => (
            <div key={label} className="px-3">
              <p className="text-[10px] font-mono font-semibold text-slate-600 uppercase tracking-wider px-2 py-2">
                {label}
              </p>
              <div className="space-y-1.5">
                {items.map((s) => {
                  const isCurrent = s.session_id === currentSessionId;
                  const isResuming = resumingId === s.session_id;
                  return (
                    <button
                      key={s.session_id}
                      id={`resume-session-${s.session_id}`}
                      onClick={() => handleResume(s)}
                      disabled={isResuming}
                      className={`w-full text-left p-3 rounded-xl border transition-all group ${
                        isCurrent
                          ? "bg-neon-cyan/8 border-neon-cyan/30 ring-1 ring-neon-cyan/20"
                          : "bg-slate-900/40 border-slate-700/40 hover:border-slate-600 hover:bg-slate-800/60"
                      }`}
                    >
                      {/* Top row: filename + time */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={isCurrent ? "text-neon-cyan" : "text-slate-500"}>
                            <FileIcon />
                          </span>
                          <span className="text-sm font-medium text-slate-200 truncate">
                            {s.file_name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-600 shrink-0 mt-0.5">
                          {formatRelative(s.created_at)}
                        </span>
                      </div>

                      {/* Second row: pipeline name */}
                      {s.pipeline_name && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-neon-cyan/60">
                            <PipelineIcon />
                          </span>
                          <span className="text-xs font-mono text-slate-400 truncate">
                            {s.pipeline_name}
                          </span>
                        </div>
                      )}

                      {/* Third row: chips */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {s.chat_message_count > 0 && (
                          <span className="flex items-center gap-1 text-[10px] font-mono text-slate-500">
                            <ChatIcon />
                            {s.chat_message_count} msg{s.chat_message_count !== 1 ? "s" : ""}
                          </span>
                        )}
                        {s.has_result && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Results
                          </span>
                        )}
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20">
                            Active
                          </span>
                        )}
                      </div>

                      {/* Resume indicator on hover */}
                      {!isCurrent && (
                        <div className="mt-2 flex items-center gap-1 text-[11px] font-mono text-neon-cyan opacity-0 group-hover:opacity-100 transition-opacity">
                          {isResuming ? (
                            <>
                              <div className="w-3 h-3 border border-neon-cyan/40 border-t-neon-cyan rounded-full animate-spin" />
                              <span>Resuming…</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                              </svg>
                              <span>Resume session</span>
                            </>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-slate-700/40 shrink-0">
          <p className="text-[10px] font-mono text-slate-600 leading-relaxed">
            Sessions expire per your plan: Explorer 1d · Analyst 7d · Studio 30d.
            Upgrading extends retention for future sessions.
          </p>
        </div>
      </aside>
    </>
  );
}
