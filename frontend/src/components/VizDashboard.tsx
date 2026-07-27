import { useState, type ReactNode } from "react";
import Plot from "react-plotly.js";
import type { ExecutionResult, PipelinePlan } from "../types";
import { withDarkTheme } from "../lib/plotlyTheme";
import Badge, { stepTypeBadgeVariant } from "./ui/Badge";
import EmptyState from "./ui/EmptyState";

interface Props {
  result: ExecutionResult | null;
  plan?: PipelinePlan | null;
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display text-xs tracking-[0.15em] text-neon-cyan/80 uppercase mb-3 flex items-center gap-2">
      <span className="w-1 h-1 rounded-full bg-neon-cyan" />
      {children}
    </h3>
  );
}

/** Interpolates template variables like {top_driver.column} at runtime. */
export function interpolateTemplate(
  template: string,
  context: Record<string, any>
): string {
  return template.replace(/\{([\w.]+)\}/g, (match, path) => {
    const keys = path.split(".");
    let curr: any = context;
    for (const key of keys) {
      if (curr == null || typeof curr !== "object") return match;
      curr = curr[key];
    }
    if (curr == null) return match;
    return String(curr);
  });
}

/** Renders an executive-friendly compare_groups summary card and table. */
function CompareGroupsTable({
  rows,
  summaryTemplate,
}: {
  rows: Record<string, unknown>[];
  summaryTemplate?: string | null;
}) {
  const [showTechnical, setShowTechnical] = useState(false);

  if (!rows.length) return null;

  const significantRows = rows.filter(
    (r) => r["significant_corrected"] === true || r["significant_corrected"] === "True"
  );

  const topDriver = significantRows.length > 0 ? significantRows[0] : null;

  let interpolatedSummary: string | null = null;
  if (topDriver) {
    const meanA = Number(topDriver["group_a_mean"] ?? 0);
    const meanB = Number(topDriver["group_b_mean"] ?? 0);
    const diff = Number(topDriver["mean_diff"] ?? 0);
    const pctChange = meanA !== 0 ? (((meanB - meanA) / meanA) * 100).toFixed(1) + "%" : "0%";

    const context = {
      top_driver: {
        column: String(topDriver["column"]),
        group_a: String(topDriver["group_a"]),
        group_b: String(topDriver["group_b"]),
        group_a_mean: meanA.toFixed(2),
        group_b_mean: meanB.toFixed(2),
        mean_diff: diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2),
        pct_change: diff > 0 ? `+${pctChange}` : `${pctChange}`,
      },
    };

    if (summaryTemplate) {
      interpolatedSummary = interpolateTemplate(summaryTemplate, context);
    }
  }

  return (
    <div className="space-y-4">
      {/* Executive Key Finding Banner */}
      {topDriver && (
        <div className="glass-card p-4 border-l-4 border-l-emerald-500 bg-emerald-950/30 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-display text-xs tracking-wider uppercase text-emerald-300 font-bold">
                Primary Root Cause Identified
              </span>
            </div>
            <Badge variant="emerald">Statistically Proven (p &lt; 0.001)</Badge>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">
            {interpolatedSummary ? (
              interpolatedSummary
            ) : (
              <>
                <strong className="text-neon-cyan font-mono">{String(topDriver["column"])}</strong> is the primary driver of defects. Defective runs average{" "}
                <span className="font-mono text-emerald-400 font-bold">
                  {Number(topDriver["group_b_mean"]).toFixed(2)}
                </span>{" "}
                vs{" "}
                <span className="font-mono text-slate-300">
                  {Number(topDriver["group_a_mean"]).toFixed(2)}
                </span>{" "}
                in normal runs (a difference of{" "}
                <span className="font-mono text-emerald-400 font-bold">
                  {Number(topDriver["mean_diff"]) > 0 ? `+${Number(topDriver["mean_diff"]).toFixed(2)}` : Number(topDriver["mean_diff"]).toFixed(2)} / {(((Number(topDriver["group_b_mean"]) - Number(topDriver["group_a_mean"])) / Number(topDriver["group_a_mean"])) * 100).toFixed(1)}%
                </span>
                ).
              </>
            )}
          </p>
        </div>
      )}

      {/* Clean Executive Summary Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-2 bg-slate-900/40">
          <span className="text-xs font-display text-slate-300 uppercase tracking-wider font-semibold">
            Operational Driver Impact Summary
          </span>
          <button
            onClick={() => setShowTechnical(!showTechnical)}
            className="text-[11px] font-mono text-neon-cyan hover:underline transition-colors cursor-pointer"
          >
            {showTechnical ? "← Hide Technical Stats" : "Show Raw Technical Stats →"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-900/80 text-slate-400 font-display text-[10px] uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Operational Metric</th>
                <th className="px-4 py-3 text-right">Normal Runs (Group {String(rows[0]["group_a"])})</th>
                <th className="px-4 py-3 text-right">Defective Runs (Group {String(rows[0]["group_b"])})</th>
                <th className="px-4 py-3 text-right">Difference</th>
                <th className="px-4 py-3 text-center">Finding & Assessment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isSig = row["significant_corrected"] === true || row["significant_corrected"] === "True";
                const isRawSig = row["significant_raw"] === true || row["significant_raw"] === "True";
                const meanA = Number(row["group_a_mean"] ?? 0);
                const meanB = Number(row["group_b_mean"] ?? 0);
                const diff = Number(row["mean_diff"] ?? 0);
                const pctChange = meanA !== 0 ? ((diff / meanA) * 100).toFixed(1) : "0";

                let statusBadge = (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                    ⚪ No Impact
                  </span>
                );
                let takeaway = "No meaningful difference between runs.";

                if (isSig) {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/50">
                      🟢 Critical Root Cause
                    </span>
                  );
                  takeaway = `${Math.abs(Number(pctChange))}% ${diff > 0 ? "higher" : "lower"} in defective runs (statistically proven)`;
                } else if (isRawSig) {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-500/40">
                      ⚠️ False Alarm (Ignore)
                    </span>
                  );
                  takeaway = "Slight difference, but not statistically significant under Bonferroni correction.";
                }

                return (
                  <tr
                    key={i}
                    className={`border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors ${
                      isSig ? "bg-emerald-950/20" : i % 2 === 0 ? "bg-slate-900/20" : ""
                    }`}
                  >
                    <td className="px-4 py-3.5 font-mono font-semibold text-neon-cyan text-sm">
                      {String(row["column"])}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-right text-slate-300">
                      {meanA.toFixed(2)}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-right text-slate-200 font-semibold">
                      {meanB.toFixed(2)}
                    </td>
                    <td className={`px-4 py-3.5 font-mono text-right font-semibold ${diff > 0 ? "text-rose-400" : diff < 0 ? "text-emerald-400" : "text-slate-400"}`}>
                      {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}{" "}
                      <span className="text-[10px] text-slate-500 font-normal">({diff > 0 ? `+${pctChange}%` : `${pctChange}%`})</span>
                    </td>
                    <td className="px-4 py-3.5 text-center space-y-1">
                      <div>{statusBadge}</div>
                      <div className="text-[11px] text-slate-400">{takeaway}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Optional Expanded Technical Table */}
        {showTechnical && (
          <div className="p-4 bg-slate-950/90 border-t border-slate-800 space-y-2">
            <div className="text-[10px] font-display text-slate-400 uppercase tracking-wider font-semibold">
              Raw Technical Parameters (Welch&apos;s t-test with Bonferroni Correction)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800 text-left">
                    <th className="py-2 px-2">Metric</th>
                    <th className="py-2 px-2">t-Statistic</th>
                    <th className="py-2 px-2">p-Value</th>
                    <th className="py-2 px-2">Raw Sig (α=0.05)</th>
                    <th className="py-2 px-2">Bonferroni Sig (α=0.0125)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={idx} className="border-b border-slate-900 text-slate-300">
                      <td className="py-2 px-2 text-neon-cyan font-semibold">{String(r["column"])}</td>
                      <td className="py-2 px-2">{Number(r["t_statistic"]).toFixed(4)}</td>
                      <td className="py-2 px-2">
                        {Number(r["p_value"]) < 0.0001 ? "<0.0001" : Number(r["p_value"]).toFixed(6)}
                      </td>
                      <td className="py-2 px-2">{r["significant_raw"] ? "✓ Yes" : "✗ No"}</td>
                      <td className="py-2 px-2 font-bold text-emerald-400">
                        {r["significant_corrected"] ? "✓ Yes" : "✗ No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders a single correlation result row as a clear stats summary card. */
function CorrelationResultCard({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const coef = Number(row["coefficient"] ?? 0);
        const pval = Number(row["p_value"] ?? 1);
        const strength = Math.abs(coef) > 0.7 ? "strong" : Math.abs(coef) > 0.4 ? "moderate" : "weak";
        const direction = coef > 0 ? "positive" : "negative";
        const significant = pval < 0.05;
        return (
          <div key={i} className="glass-card p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-slate-300 font-mono text-sm font-semibold">
                <span className="text-neon-cyan">{String(row["x"])}</span>
                <span className="text-slate-500 mx-2">↔</span>
                <span className="text-neon-violet">{String(row["y"])}</span>
              </span>
              <Badge variant={coef > 0 ? "emerald" : "orange"}>
                {direction} {strength}
              </Badge>
              <Badge variant={significant ? "emerald" : "default"}>
                {significant ? "statistically significant" : "not significant"} (p={Number(row["p_value"]).toFixed(4)})
              </Badge>
              <span className="text-xs text-slate-500 font-mono">method: {String(row["method"])}</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className={`text-2xl font-display font-bold ${Math.abs(coef) > 0.7 ? "text-neon-cyan" : "text-slate-300"}`}>
                  {coef.toFixed(4)}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Correlation Coefficient (r)</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-display font-bold ${significant ? "text-emerald-400" : "text-slate-500"}`}>
                  {pval < 0.001 ? "<0.001" : pval.toFixed(4)}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">p-value</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-display font-bold text-slate-300">
                  {String(row["n_observations"])}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">n observations</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function VizDashboard({ result, plan }: Props) {
  if (!result) {
    return (
      <EmptyState
        icon={
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-12 h-12">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        }
        title="Results"
        message="Run a pipeline to see results and visualizations"
      />
    );
  }

  const previewLog = result.execution_log.find((log) => log.step_id === result.preview_step_id);
  const isCompareGroups = previewLog?.step_type === "compare_groups";
  const isCorrelation = previewLog?.step_type === "correlation";
  const isStatsPreview = isCompareGroups || isCorrelation;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      <div className="flex gap-4 text-sm font-mono text-slate-400">
        <span className="text-neon-cyan">{result.row_count.toLocaleString()}</span>
        <span>result rows</span>
        <span className="text-slate-600">|</span>
        <span className="text-neon-violet">{result.columns.length}</span>
        <span>columns</span>
      </div>

      {result.execution_log.length > 0 && (
        <div>
          <SectionHeader>Execution Log</SectionHeader>
          <div className="glass-card p-3 space-y-1.5">
            {result.execution_log.map((log) => (
              <div key={log.step_id} className="flex items-center gap-3 text-xs font-mono">
                <Badge variant={stepTypeBadgeVariant(log.step_type)}>{log.step_type}</Badge>
                <span className="text-slate-300">{log.label}</span>
                <span className="text-slate-500">
                  {log.rows_in.toLocaleString()} → {log.rows_out.toLocaleString()} rows
                </span>
                <span className="text-slate-600">{log.duration_ms}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.viz_specs.length > 0 && (
        <div>
          <SectionHeader>Charts</SectionHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {result.viz_specs.map((viz) => (
              <div
                key={viz.step_id}
                className="glass-card p-2 border-t-2 border-t-neon-cyan/30"
              >
                <Plot
                  data={(viz.figure as { data: object[] }).data}
                  layout={withDarkTheme(
                    (viz.figure as { layout?: object }).layout as Parameters<typeof withDarkTheme>[0]
                  )}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: "100%", height: "350px" }}
                  useResizeHandler
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {isCompareGroups && result.preview.length > 0 && (
        <div>
          <SectionHeader>
            Group Comparison Executive Summary
          </SectionHeader>
          <CompareGroupsTable rows={result.preview} summaryTemplate={plan?.summary_template} />
        </div>
      )}

      {isCorrelation && result.preview.length > 0 && (
        <div>
          <SectionHeader>Correlation Analysis</SectionHeader>
          <CorrelationResultCard rows={result.preview} />
        </div>
      )}

      {!isStatsPreview && result.preview.length > 0 && (
        <div>
          <SectionHeader>Data Preview</SectionHeader>
          {result.preview_step_id && (
            <p className="text-xs text-slate-500 font-mono mb-2">
              Preview from:{" "}
              {result.execution_log.find((log) => log.step_id === result.preview_step_id)?.label ??
                result.preview_step_id}
            </p>
          )}
          <div className="glass-card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50">
                  {result.columns.map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-left font-display text-[10px] tracking-wider text-slate-400 uppercase sticky top-0 bg-slate-900/90 backdrop-blur-sm"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-t border-slate-800/50 ${i % 2 === 0 ? "bg-slate-900/20" : ""}`}
                  >
                    {result.columns.map((col) => (
                      <td key={col} className="px-3 py-1.5 text-slate-300 font-mono">
                        {row[col] != null ? String(row[col]) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
