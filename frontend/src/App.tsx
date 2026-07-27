import { useEffect, useState, useCallback } from "react";
import type { DatasetProfile, ExecutionResult, PipelinePlan } from "./types";
import FileUpload from "./components/FileUpload";
import AgentChat from "./components/AgentChat";
import PipelineCanvas from "./components/PipelineCanvas";
import VizDashboard from "./components/VizDashboard";
import AuthPage from "./components/AuthPage";
import PipelineLibrary from "./components/PipelineLibrary";
import SavedPipelinesModal from "./components/SavedPipelinesModal";
import SessionHistoryPanel from "./components/SessionHistoryPanel";
import LandingPage from "./pages/Landing/LandingPage";
import PricingPage from "./pages/PricingPage";
import BillingPage from "./pages/BillingPage";
import TierBadge from "./components/TierBadge";
import UpgradeModal from "./components/UpgradeModal";
import Button from "./components/ui/Button";
import ProgressBar from "./components/ui/ProgressBar";
import { useAuth } from "./hooks/useAuth";
import { useBilling } from "./hooks/useBilling";
import { claimSession, updatePipeline, setLimitExceededHandler, getSessionProfile, getPipeline } from "./lib/api";
import { savePipeline } from "./lib/firestore";

export default function App() {
  const { user, loading, logout } = useAuth();
  const {
    billing,
    loading: billingLoading,
    upgradeModalError,
    triggerUpgradeModal,
    closeUpgradeModal,
    handleCheckout,
    handleOpenPortal,
    refreshBilling,
  } = useBilling();

  const [currentView, setCurrentView] = useState<"landing" | "studio" | "auth" | "pricing" | "billing">(
    window.location.pathname === "/pricing" || window.location.hash === "#pricing"
      ? "pricing"
      : window.location.pathname === "/billing" || window.location.hash === "#billing"
      ? "billing"
      : "landing"
  );

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [pipelineRefresh, setPipelineRefresh] = useState(0);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [showUpload, setShowUpload] = useState(true);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showSavedWebhooks, setShowSavedWebhooks] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentPipeline, setCurrentPipeline] = useState<PipelinePlan | null>(null);
  // Pipeline imported before any file was uploaded — applied automatically on first upload
  const [pendingPipeline, setPendingPipeline] = useState<PipelinePlan | null>(null);
  const [pendingNotice, setPendingNotice] = useState(false);
  const [restoringSession, setRestoringSession] = useState(false);
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  // Tier the user wants to upgrade to — stored when unauthenticated, resumed after login
  const [pendingTier, setPendingTier] = useState<"analyst" | "studio" | null>(null);

  const tierName = (billing?.tier ?? "explorer").toLowerCase();
  const canSaveWebhooks = tierName === "analyst" || tierName === "studio";

  // ── Register 402 interceptor callback ──────────────────────────────────────
  useEffect(() => {
    setLimitExceededHandler((err) => {
      triggerUpgradeModal(err);
    });
    return () => {
      setLimitExceededHandler(null);
    };
  }, [triggerUpgradeModal]);

  // ── After login, auto-resume a pending checkout if one was queued ───────────
  useEffect(() => {
    if (!user || !pendingTier) return;
    const tier = pendingTier;
    setPendingTier(null);
    // Small delay to let billing state settle after auth
    const t = setTimeout(() => handleCheckout(tier), 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

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
    // Refresh quota counts — an upload was just consumed
    refreshBilling();
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

  /**
   * Resume an existing session from the history panel.
   * Fetches the DatasetProfile and pipeline without re-uploading any file.
   * The parquet is retrieved from Supabase Storage on-demand by the backend.
   */
  const restoreSession = useCallback(async (id: string) => {
    setRestoringSession(true);
    try {
      // Fetch profile (schema) — the backend re-downloads the parquet from Supabase if needed
      const prof = await getSessionProfile(id);
      // Fetch any pipeline stored for this session
      const plan = await getPipeline(id).catch(() => null);

      setSessionId(id);
      setProfile(prof);
      setShowUpload(false);
      setResult(null);
      if (plan) {
        setCurrentPipeline(plan);
        setPipelineRefresh((k) => k + 1);
      } else {
        setCurrentPipeline(null);
        setPipelineRefresh((k) => k + 1);
      }
      setShowHistory(false);
    } catch (err) {
      console.error("Failed to restore session:", err);
    } finally {
      setRestoringSession(false);
    }
  }, []);

  /** Load a pipeline from the library into the active session */
  const handleLoadPipeline = async (plan: PipelinePlan) => {
    if (!sessionId) {
      // No file uploaded yet — queue the pipeline so it's applied on next upload
      setPendingPipeline(plan);
      setPendingNotice(true);
      return;
    }
    setLoadingPipeline(true);
    try {
      await updatePipeline(sessionId, plan);
      setCurrentPipeline(plan);
      setPipelineRefresh((k) => k + 1);
    } catch {
      /* user can still see the pipeline visually */
      setCurrentPipeline(plan);
      setPipelineRefresh((k) => k + 1);
    } finally {
      setLoadingPipeline(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center grid-bg">
        {/* Global loading bar at very top */}
        <div className="top-progress-bar" />
        <div className="text-center space-y-4">
          <p className="font-display text-2xl font-bold tracking-[0.3em] gradient-text">
            GLASSWORK
          </p>
          <ProgressBar variant="indeterminate" className="w-48 mx-auto" />
          <p className="text-xs font-mono text-slate-600">Initializing workspace…</p>
        </div>
      </div>
    );
  }

  if (currentView === "landing") {
    return (
      <LandingPage
        onLaunchStudio={() => {
          if (user) {
            setCurrentView("studio");
          } else {
            setCurrentView("auth");
          }
        }}
        onViewPricing={() => setCurrentView("pricing")}
      />
    );
  }

  /**
   * Guarded checkout: unauthenticated users are redirected to auth with the
   * selected tier queued; after login it fires automatically.
   */
  const handleCheckoutGuarded = async (tier: "analyst" | "studio") => {
    if (!user) {
      setPendingTier(tier);
      setCurrentView("auth");
      return;
    }
    await handleCheckout(tier);
  };

  if (currentView === "pricing") {
    return (
      <PricingPage
        currentTier={billing?.tier || "explorer"}
        isAuthenticated={!!user}
        onCheckout={handleCheckoutGuarded}
        onNavigateStudio={() => setCurrentView(user ? "studio" : "landing")}
        onNavigateLanding={() => setCurrentView("landing")}
      />
    );
  }

  if (currentView === "billing") {
    return (
      <BillingPage
        billing={billing}
        loading={billingLoading}
        onOpenPortal={handleOpenPortal}
        onNavigatePricing={() => setCurrentView("pricing")}
        onNavigateStudio={() => setCurrentView("studio")}
      />
    );
  }

  if (!user || currentView === "auth") {
    const tierLabel = pendingTier ? pendingTier.charAt(0).toUpperCase() + pendingTier.slice(1) : null;
    return (
      <AuthPage
        contextMessage={
          tierLabel
            ? `Sign in or create an account to complete your ${tierLabel} upgrade.`
            : undefined
        }
        onAuthSuccess={() => {
          // If a tier checkout is pending, go to pricing so the auto-checkout fires
          setCurrentView(pendingTier ? "pricing" : "studio");
        }}
        onNavigateBack={currentView === "auth" && !pendingTier ? () => setCurrentView("landing") : undefined}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col grid-bg overflow-hidden">
      {/* Global top-of-page progress bar for async operations */}
      {(restoringSession || loadingPipeline) && <div className="top-progress-bar" />}
      <header className="glass-panel border-b section-divider px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-display text-xl font-bold tracking-[0.2em] gradient-text cursor-pointer" onClick={() => setCurrentView("landing")}>
              GLASSWORK
            </h1>
            <p className="font-mono text-[10px] text-slate-500 tracking-widest uppercase mt-0.5">
              Agentic Data Platform
            </p>
          </div>
          <div className="flex items-center gap-3 ml-4 pl-4 border-l border-slate-700/50">
            <span
              className={`w-2 h-2 rounded-full ${
                sessionId ? "bg-neon-emerald animate-pulse-glow" : "bg-[#4DD9C4]"
              }`}
            />
            <span className="text-xs font-mono text-slate-500">
              {sessionId ? "Session Active" : "Ready"}
            </span>

            <TierBadge
              tier={billing?.tier || "explorer"}
              onClick={() => setCurrentView("billing")}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCurrentView("pricing")}
            id="open-pricing-btn"
          >
            Pricing
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCurrentView("landing")}
            id="open-landing-btn"
          >
            Landing Page
          </Button>
          {canSaveWebhooks ? (
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
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCurrentView("pricing")}
              id="open-webhooks-btn"
              title="Upgrade to Analyst or Studio to save webhook pipelines"
            >
              <svg className="w-3.5 h-3.5 mr-1.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-slate-400">Webhooks</span>
              <span className="ml-1.5 text-[10px] font-mono text-amber-400 bg-amber-400/10 px-1 rounded">Pro</span>
            </Button>
          )}
          {/* Session History button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowHistory(true)}
            id="open-history-btn"
            title="Browse and resume previous sessions"
          >
            <svg className="w-3.5 h-3.5 mr-1.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowLibrary(true)}
            id="open-library-btn"
          >
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
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
            <div
              className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-bold text-white shadow-neon-sm overflow-hidden cursor-pointer"
              onClick={() => setCurrentView("billing")}
              title="Manage Subscription & Billing"
            >
              <img
                src={
                  user.photoURL ||
                  `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(
                    user.displayName || user.email || user.uid
                  )}&backgroundColor=0f172a&shapeColor=4DD9C4`
                }
                alt="avatar"
                className="w-full h-full object-cover"
              />
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
              onExecuted={(res) => { setResult(res); refreshBilling(); }}
              onPipelineChange={setCurrentPipeline}
              onOpenWebhooks={() => setShowSavedWebhooks(true)}
              processOnClient={profile?.process_on_client}
            />
          </div>
          <div className="h-80 min-h-0 glass-panel">
            <VizDashboard result={result} plan={currentPipeline} />
          </div>
        </div>
      </div>

      {showLibrary && (
        <PipelineLibrary
          user={user}
          tier={billing?.tier || "explorer"}
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
          tier={billing?.tier || "explorer"}
          onNavigatePricing={() => { setShowSavedWebhooks(false); setCurrentView("pricing"); }}
          onClose={() => setShowSavedWebhooks(false)}
        />
      )}

      {upgradeModalError && (
        <UpgradeModal
          errorInfo={upgradeModalError}
          onClose={closeUpgradeModal}
          onCheckout={handleCheckout}
        />
      )}

      {showHistory && (
        <SessionHistoryPanel
          currentSessionId={sessionId}
          onResume={restoreSession}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

