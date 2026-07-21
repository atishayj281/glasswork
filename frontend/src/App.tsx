import { useEffect, useState } from "react";
import type { DatasetProfile, ExecutionResult, PipelinePlan } from "./types";
import FileUpload from "./components/FileUpload";
import AgentChat from "./components/AgentChat";
import PipelineCanvas from "./components/PipelineCanvas";
import VizDashboard from "./components/VizDashboard";
import AuthPage from "./components/AuthPage";
import PipelineLibrary from "./components/PipelineLibrary";
import SavedPipelinesModal from "./components/SavedPipelinesModal";
import Button from "./components/ui/Button";
import { useAuth } from "./hooks/useAuth";
import { claimSession, updatePipeline } from "./lib/api";
import { savePipeline } from "./lib/firestore";

export default function App() {
  const { user, loading, logout } = useAuth();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [pipelineRefresh, setPipelineRefresh] = useState(0);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [showUpload, setShowUpload] = useState(true);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showSavedWebhooks, setShowSavedWebhooks] = useState(false);
  const [currentPipeline, setCurrentPipeline] = useState<PipelinePlan | null>(null);
  // Pipeline imported before any file was uploaded — applied automatically on first upload
  const [pendingPipeline, setPendingPipeline] = useState<PipelinePlan | null>(null);
  const [pendingNotice, setPendingNotice] = useState(false);

  // ── Session migration: claim anonymous session when user logs in ───────────
  useEffect(() => {
    if (!user || !sessionId) return;
    (async () => {
      try {
        await claimSession(sessionId);
        // Auto-save any existing pipeline to the user's Firestore account
        if (currentPipeline) {
          await savePipeline(user.uid, currentPipeline.name || "Migrated Pipeline", currentPipeline, profile);
        }
      } catch {
        /* non-critical — session may already be claimed */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]); // only runs when uid changes (i.e. on login)

  const handleUploaded = async (id: string, prof: DatasetProfile) => {
    setSessionId(id);
    setProfile(prof);
    setShowUpload(false);
    setResult(null);
    // Apply a pipeline that was imported before any file existed
    if (pendingPipeline) {
      try {
        await updatePipeline(id, pendingPipeline);
        setCurrentPipeline(pendingPipeline);
        setPipelineRefresh((k) => k + 1);
      } catch {
        /* non-critical — pipeline can be re-imported */
      } finally {
        setPendingPipeline(null);
        setPendingNotice(false);
      }
    }
  };

  /** Load a pipeline from the library into the active session */
  const handleLoadPipeline = async (plan: PipelinePlan) => {
    if (!sessionId) {
      // No file uploaded yet — queue the pipeline so it's applied on next upload
      setPendingPipeline(plan);
      setPendingNotice(true);
      return;
    }
    try {
      await updatePipeline(sessionId, plan);
      setCurrentPipeline(plan);
      setPipelineRefresh((k) => k + 1);
    } catch {
      /* user can still see the pipeline visually */
      setCurrentPipeline(plan);
      setPipelineRefresh((k) => k + 1);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center grid-bg">
        <div className="text-center">
          <p className="font-display text-2xl font-bold tracking-[0.3em] gradient-text animate-pulse">
            AEGIS
          </p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <div className="h-screen flex flex-col grid-bg overflow-hidden">
      <header className="glass-panel border-b section-divider px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-display text-xl font-bold tracking-[0.2em] gradient-text">
              AEGIS
            </h1>
            <p className="font-mono text-[10px] text-slate-500 tracking-widest uppercase mt-0.5">
              Agentic Data Platform
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-700/50">
            <span
              className={`w-2 h-2 rounded-full ${
                sessionId ? "bg-neon-emerald animate-pulse-glow" : "bg-slate-600"
              }`}
            />
            <span className="text-xs font-mono text-slate-500">
              {sessionId ? "Session Active" : "Ready"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowSavedWebhooks(true)}
            id="open-webhooks-btn"
          >
            <svg className="w-3.5 h-3.5 mr-1.5 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Webhooks
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowLibrary(true)}
            id="open-library-btn"
          >
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Pipelines
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowUpload(!showUpload)}
          >
            {showUpload ? "Hide Upload" : "Upload New File"}
          </Button>

          {/* User avatar + logout */}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-700/50">
            <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-bold text-white shadow-neon-sm overflow-hidden">
              {user.photoURL ? (
                <img src={user.photoURL} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                (user.displayName?.[0] ?? user.email?.[0] ?? "U").toUpperCase()
              )}
            </div>
            <button
              id="logout-btn"
              onClick={logout}
              className="text-xs text-slate-500 hover:text-slate-300 font-mono transition-colors"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {showUpload && (
        <div className="shrink-0 border-b section-divider">
          {pendingNotice && (
            <div className="px-4 py-2 bg-neon-violet/10 border-b border-neon-violet/30 flex items-center gap-2">
              <svg className="w-4 h-4 text-neon-violet shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs font-mono text-neon-violet">
                Pipeline <strong>&ldquo;{pendingPipeline?.name}&rdquo;</strong> queued — upload a file to apply it.
              </p>
              <button
                onClick={() => { setPendingPipeline(null); setPendingNotice(false); }}
                className="ml-auto text-neon-violet/60 hover:text-neon-violet transition-colors text-xs"
              >✕</button>
            </div>
          )}
          <FileUpload onUploaded={handleUploaded} />
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <div className="w-96 border-r section-divider glass-panel flex flex-col min-h-0">
          <AgentChat
            sessionId={sessionId}
            profile={profile}
            onPipelineGenerated={() => setPipelineRefresh((k) => k + 1)}
          />
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 border-b section-divider">
            <PipelineCanvas
              sessionId={sessionId}
              refreshKey={pipelineRefresh}
              onExecuted={setResult}
              onPipelineChange={setCurrentPipeline}
              onOpenWebhooks={() => setShowSavedWebhooks(true)}
              processOnClient={profile?.process_on_client}
            />
          </div>
          <div className="h-80 min-h-0 glass-panel">
            <VizDashboard result={result} />
          </div>
        </div>
      </div>

      {showLibrary && (
        <PipelineLibrary
          user={user}
          currentPipeline={currentPipeline}
          profile={profile}
          onLoad={handleLoadPipeline}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {showSavedWebhooks && (
        <SavedPipelinesModal
          sessionId={sessionId}
          currentPipelineName={currentPipeline?.name}
          onClose={() => setShowSavedWebhooks(false)}
        />
      )}
    </div>
  );
}

