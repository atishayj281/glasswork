import { useEffect, useState } from "react";
import type { SavedPipelineItem } from "../types";
import {
  listSavedPipelines,
  promotePipeline,
  deleteSavedPipeline,
  rotatePipelineSecret,
} from "../lib/api";
import Button from "./ui/Button";

interface Props {
  sessionId: string | null;
  currentPipelineName?: string;
  onClose: () => void;
}

export default function SavedPipelinesModal({
  sessionId,
  currentPipelineName = "Saved Pipeline",
  onClose,
}: Props) {
  const [pipelines, setPipelines] = useState<SavedPipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState(currentPipelineName);
  const [error, setError] = useState<string | null>(null);

  // Newly generated secret display (shown once after save or rotate)
  const [generatedSecret, setGeneratedSecret] = useState<{
    name: string;
    pipeline_id: string;
    webhook_secret: string;
    action: "saved" | "rotated";
  } | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmRotateId, setConfirmRotateId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchPipelines = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSavedPipelines();
      setPipelines(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to load saved webhooks: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPipelines();
  }, []);

  const handlePromote = async () => {
    if (!sessionId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await promotePipeline(sessionId, saveName || "Saved Pipeline");
      setGeneratedSecret({
        name: res.name,
        pipeline_id: res.pipeline_id,
        webhook_secret: res.webhook_secret,
        action: "saved",
      });
      await fetchPipelines();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRotate = async (pipelineId: string) => {
    setError(null);
    try {
      const res = await rotatePipelineSecret(pipelineId);
      const target = pipelines.find((p) => p.pipeline_id === pipelineId);
      setGeneratedSecret({
        name: target?.name || "Pipeline",
        pipeline_id: pipelineId,
        webhook_secret: res.webhook_secret,
        action: "rotated",
      });
      setConfirmRotateId(null);
      await fetchPipelines();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Secret rotation failed: ${msg}`);
    }
  };

  const handleDelete = async (pipelineId: string) => {
    setError(null);
    try {
      await deleteSavedPipeline(pipelineId);
      setConfirmDeleteId(null);
      setPipelines((prev) => prev.filter((p) => p.pipeline_id !== pipelineId));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Delete failed: ${msg}`);
    }
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getWebhookUrl = (pipelineId: string) => {
    const origin = window.location.origin;
    return `${origin}/api/webhooks/${pipelineId}/trigger`;
  };

  const getCurlSnippet = (pipelineId: string, secret?: string) => {
    const url = getWebhookUrl(pipelineId);
    const sec = secret || "<YOUR_WEBHOOK_SECRET>";
    return `curl -X POST "${url}" \\\n  -H "X-Webhook-Secret: ${sec}" \\\n  -F "file=@data.csv"`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-2xl mx-4 glass-panel rounded-2xl border border-slate-700/60 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 shrink-0">
          <div>
            <h2 className="font-display text-base font-bold gradient-text tracking-widest uppercase">
              Webhook Pipelines
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Persistent APIs triggerable via n8n, cron, or curl
            </p>
          </div>
          <button
            id="saved-webhooks-close"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Promote / Save current session pipeline */}
        {sessionId && !generatedSecret && (
          <div className="px-6 py-4 border-b border-slate-700/40 bg-slate-900/40 shrink-0">
            <p className="text-xs text-neon-cyan font-mono mb-2 uppercase tracking-wider font-semibold">
              Save Active Pipeline as Webhook
            </p>
            <div className="flex gap-2">
              <input
                id="saved-pipeline-name-input"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Webhook pipeline name…"
                className="flex-1 bg-slate-800/80 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-neon-cyan transition-all"
              />
              <Button
                id="save-as-webhook-btn"
                variant="primary"
                size="sm"
                onClick={handlePromote}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save as Webhook"}
              </Button>
            </div>
          </div>
        )}

        {/* Secret Created / Rotated Notice Banner */}
        {generatedSecret && (
          <div className="p-5 border-b border-emerald-500/30 bg-emerald-950/40 shrink-0">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 uppercase tracking-wider mb-1">
                  Secret {generatedSecret.action === "saved" ? "Generated" : "Rotated"}
                </span>
                <h3 className="text-sm font-semibold text-emerald-200">
                  {generatedSecret.name}
                </h3>
              </div>
              <button
                onClick={() => setGeneratedSecret(null)}
                className="text-slate-400 hover:text-slate-200 text-xs font-mono"
              >
                Dismiss ✕
              </button>
            </div>
            <p className="text-xs text-slate-300 mt-2">
              Save this secret key now. For security, it will <strong className="text-emerald-300">never be shown again</strong>.
            </p>
            
            <div className="mt-3 p-3 rounded-lg bg-slate-950 border border-emerald-500/40 flex items-center justify-between font-mono text-xs">
              <span className="text-emerald-400 truncate select-all">
                {generatedSecret.webhook_secret}
              </span>
              <button
                id="copy-generated-secret-btn"
                onClick={() =>
                  copyToClipboard(generatedSecret.webhook_secret, "generated-secret")
                }
                className="ml-3 px-3 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold transition-all shrink-0"
              >
                {copiedField === "generated-secret" ? "Copied!" : "Copy Secret"}
              </button>
            </div>

            <div className="mt-3">
              <p className="text-[11px] font-mono text-slate-400 mb-1">curl Example:</p>
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-[11px] text-slate-300 relative">
                <pre className="whitespace-pre-wrap">
                  {getCurlSnippet(generatedSecret.pipeline_id, generatedSecret.webhook_secret)}
                </pre>
                <button
                  id="copy-generated-curl-btn"
                  onClick={() =>
                    copyToClipboard(
                      getCurlSnippet(generatedSecret.pipeline_id, generatedSecret.webhook_secret),
                      "generated-curl",
                    )
                  }
                  className="absolute top-2 right-2 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition-all"
                >
                  {copiedField === "generated-curl" ? "Copied!" : "Copy curl"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div className="px-6 py-2 bg-red-950/50 border-b border-red-500/30 text-red-300 text-xs font-mono shrink-0">
            {error}
          </div>
        )}

        {/* Saved Pipelines List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {loading && (
            <p className="text-slate-500 text-sm font-mono text-center py-8">
              Loading saved pipelines…
            </p>
          )}

          {!loading && pipelines.length === 0 && (
            <div className="text-center py-10">
              <svg className="w-10 h-10 text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p className="text-slate-400 text-sm font-medium">No saved webhook pipelines</p>
              <p className="text-slate-500 text-xs font-mono mt-1">
                Generate or edit a pipeline in chat, then save it as a webhook
              </p>
            </div>
          )}

          {pipelines.map((sp) => {
            const url = getWebhookUrl(sp.pipeline_id);
            const isDeleting = confirmDeleteId === sp.pipeline_id;
            const isRotating = confirmRotateId === sp.pipeline_id;

            return (
              <div
                key={sp.pipeline_id}
                className="p-4 rounded-xl border border-slate-700/50 bg-slate-900/50 hover:border-slate-600 transition-all space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">{sp.name}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20">
                        {sp.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1">
                      {sp.pipeline.steps.length} steps · Triggered {sp.trigger_count} times
                      {sp.last_triggered_at
                        ? ` · Last: ${new Date(sp.last_triggered_at).toLocaleString()}`
                        : " · Never triggered"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      id={`rotate-secret-${sp.pipeline_id}`}
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirmRotateId(sp.pipeline_id)}
                      title="Rotate secret key"
                    >
                      Rotate Secret
                    </Button>
                    <button
                      id={`delete-pipeline-${sp.pipeline_id}`}
                      onClick={() => setConfirmDeleteId(sp.pipeline_id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-all"
                      title="Delete saved pipeline"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Confirm Delete Inline Box */}
                {isDeleting && (
                  <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 flex items-center justify-between text-xs font-mono text-red-200">
                    <span>Delete pipeline permanently? Webhook URL will stop working.</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDelete(sp.pipeline_id)}
                        className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-semibold transition-all"
                      >
                        Confirm Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirm Rotate Inline Box */}
                {isRotating && (
                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/40 flex items-center justify-between text-xs font-mono text-amber-200">
                    <span>Rotate secret? Existing triggers using the old secret will fail.</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRotate(sp.pipeline_id)}
                        className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-all"
                      >
                        Confirm Rotate
                      </button>
                      <button
                        onClick={() => setConfirmRotateId(null)}
                        className="px-2 py-1 text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Webhook Endpoint Info */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between font-mono text-xs p-2 rounded bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 truncate mr-2">{url}</span>
                    <button
                      id={`copy-url-${sp.pipeline_id}`}
                      onClick={() => copyToClipboard(url, `url-${sp.pipeline_id}`)}
                      className="text-neon-cyan hover:underline text-[11px] shrink-0 font-sans"
                    >
                      {copiedField === `url-${sp.pipeline_id}` ? "Copied!" : "Copy URL"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between font-mono text-xs p-2 rounded bg-slate-950 border border-slate-800">
                    <span className="text-slate-500">Header: X-Webhook-Secret</span>
                    <button
                      id={`copy-curl-${sp.pipeline_id}`}
                      onClick={() =>
                        copyToClipboard(getCurlSnippet(sp.pipeline_id), `curl-${sp.pipeline_id}`)
                      }
                      className="text-slate-400 hover:text-slate-200 text-[11px] shrink-0 font-sans"
                    >
                      {copiedField === `curl-${sp.pipeline_id}` ? "Copied!" : "Copy curl"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
