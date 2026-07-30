import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { DatasetProfile, PipelinePlan, PipelineStep, SavedPipeline } from "../types";
import { getUserPipelines, savePipeline, deletePipeline } from "../lib/firestore";
import ProgressBar from "./ui/ProgressBar";

interface Props {
  user: User;
  tier: string;
  currentPipeline: PipelinePlan | null;
  profile: DatasetProfile | null;
  onLoad: (pipeline: PipelinePlan) => void;
  onClose: () => void;
}

export default function PipelineLibrary({ user, tier, currentPipeline, profile, onLoad, onClose }: Props) {
  const canSave = tier === "analyst" || tier === "studio";
  const [pipelines, setPipelines] = useState<SavedPipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState(currentPipeline?.name ?? "Untitled Pipeline");
  const [error, setError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    getUserPipelines(user.uid)
      .then((ps) => mounted && setPipelines(ps))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Failed to load pipelines: ${msg}`);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [user.uid]);

  // ── Save current pipeline ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!currentPipeline) return;
    setSaving(true);
    setError(null);
    try {
      await savePipeline(user.uid, saveName || "Untitled Pipeline", currentPipeline, profile);
      const ps = await getUserPipelines(user.uid);
      setPipelines(ps);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    await deletePipeline(user.uid, id);
    setPipelines((ps) => ps.filter((p) => p.id !== id));
  };

  // ── Export current pipeline as JSON ───────────────────────────────────────
  const handleExport = () => {
    if (!currentPipeline) return;
    const blob = new Blob([JSON.stringify(currentPipeline, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentPipeline.name || "pipeline"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Import pipeline from JSON file ────────────────────────────────────────
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string);
        const parsed = (raw && typeof raw === "object" ? raw.plan || raw.pipeline || raw : null) as any;
        if (!parsed || !Array.isArray(parsed.steps)) {
          throw new Error("Missing 'steps' array in pipeline JSON");
        }

        const normalizedSteps: PipelineStep[] = parsed.steps.map((s: any, idx: number) => {
          let stepType = String(s.type || "filter").toLowerCase();
          const typeMap: Record<string, string> = {
            group_by: "groupby_agg",
            groupby: "groupby_agg",
            aggregate: "groupby_agg",
            agg: "groupby_agg",
            select: "select_columns",
            select_column: "select_columns",
            fillna: "fill_na",
            drop_na: "fill_na",
            dropna: "fill_na",
            cast: "cast_type",
            type_cast: "cast_type",
            chart: "visualize",
            plot: "visualize",
            vis: "visualize",
            compute: "compute_column",
            add_column: "compute_column",
            calculate: "compute_column",
            dedup: "deduplicate",
            drop_duplicates: "deduplicate",
          };
          if (typeMap[stepType]) stepType = typeMap[stepType];

          const params = s.params && typeof s.params === "object" ? { ...s.params } : {};
          // Normalize filter operators if legacy/custom syntax was imported
          if (stepType === "filter" && params.op) {
            const opMap: Record<string, string> = {
              "==": "eq",
              "!=": "neq",
              ">": "gt",
              ">=": "gte",
              "<": "lt",
              "<=": "lte",
              "equals": "eq",
            };
            if (opMap[params.op]) params.op = opMap[params.op];
          }

          const hasValidPos =
            s.position &&
            typeof s.position === "object" &&
            typeof s.position.x === "number" &&
            typeof s.position.y === "number";

          return {
            id: String(s.id || `step_${Date.now()}_${idx}`),
            type: stepType as any,
            label: String(s.label || s.name || s.type || `Step ${idx + 1}`),
            params,
            position: hasValidPos ? { x: s.position.x, y: s.position.y } : { x: 100, y: idx * 120 },
          };
        });

        const normalizedEdges = Array.isArray(parsed.edges)
          ? parsed.edges.map((edge: any) => ({
              source: String(edge.source),
              target: String(edge.target),
            }))
          : [];

        const plan: PipelinePlan = {
          name: String(parsed.name || file.name.replace(/\.json$/i, "") || "Imported Pipeline"),
          summary_template: parsed.summary_template || null,
          steps: normalizedSteps,
          edges: normalizedEdges,
        };

        onLoad(plan);
        onClose();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Invalid pipeline file: ${msg}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const fmt = (ts?: { seconds: number }) =>
    ts ? new Date(ts.seconds * 1000).toLocaleDateString() : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 glass-panel rounded-2xl border border-slate-700/50 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 shrink-0">
          <div>
            <h2 className="font-display text-base font-bold gradient-text tracking-widest">
              PIPELINE LIBRARY
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">Saved to your account</p>
          </div>
          <button
            id="lib-close"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Save current pipeline — Analyst+ only */}
        {currentPipeline && (
          <div className="px-6 py-4 border-b border-slate-700/40 shrink-0">
            <p className="text-xs text-slate-400 font-mono mb-2 uppercase tracking-wider">Save Current Pipeline</p>

            {canSave ? (
              <div className="flex gap-2">
                <input
                  id="lib-save-name"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Pipeline name…"
                  className="flex-1 bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-cyan/60 transition-all"
                />
                <button
                  id="lib-save-btn"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-gradient-primary text-white text-sm font-medium shadow-neon-sm hover:shadow-neon-md transition-all disabled:opacity-50 shrink-0"
                >
                  {saving ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                      </svg>
                      Saving…
                    </span>
                  ) : "Save"}
                </button>
              </div>
            ) : (
              /* Explorer upgrade wall */
              <div className="flex items-center gap-3 p-3 rounded-xl bg-neon-cyan/5 border border-neon-cyan/20">
                <svg className="w-4 h-4 text-neon-cyan shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-slate-300">Saving pipelines requires <span className="text-neon-cyan font-bold">Analyst</span> or higher.</p>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">You can still export as JSON below.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Import / Export toolbar */}
        <div className="px-6 py-3 border-b border-slate-700/40 flex items-center gap-3 shrink-0">
          <button
            id="lib-export-btn"
            onClick={handleExport}
            disabled={!currentPipeline}
            title="Export current pipeline as JSON"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-600/50 text-slate-400 hover:text-slate-200 hover:border-neon-cyan/40 text-xs font-mono transition-all disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export JSON
          </button>
          <button
            id="lib-import-btn"
            onClick={() => importRef.current?.click()}
            title="Import pipeline from JSON file"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-600/50 text-slate-400 hover:text-slate-200 hover:border-neon-violet/40 text-xs font-mono transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
            </svg>
            Import JSON
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          {error && (
            <p className="text-red-400 text-xs font-mono ml-auto">{error}</p>
          )}
        </div>

        {/* Pipeline list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 min-h-0">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="w-8 h-8 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
              <ProgressBar variant="indeterminate" className="max-w-xs" />
              <p className="text-xs text-slate-500 font-mono">Loading pipelines…</p>
            </div>
          )}
          {!loading && pipelines.length === 0 && (
            <div className="text-center py-10">
              <p className="text-slate-500 text-sm">No saved pipelines yet</p>
              <p className="text-slate-600 text-xs font-mono mt-1">Build a pipeline and save it above</p>
            </div>
          )}
          {pipelines.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-700/40 hover:border-slate-600/60 bg-slate-800/30 hover:bg-slate-800/50 transition-all group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{p.name}</p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {p.plan.steps.length} steps · Saved {fmt(p.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  id={`lib-load-${p.id}`}
                  onClick={() => { onLoad(p.plan); onClose(); }}
                  className="px-3 py-1 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan text-xs font-mono hover:bg-neon-cyan/20 transition-all"
                >
                  Load
                </button>
                <button
                  id={`lib-del-${p.id}`}
                  onClick={() => handleDelete(p.id)}
                  className="p-1 rounded-lg text-slate-600 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
