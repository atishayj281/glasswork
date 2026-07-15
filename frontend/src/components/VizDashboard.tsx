import Plot from "react-plotly.js";
import type { ExecutionResult } from "../types";
import { withDarkTheme } from "../lib/plotlyTheme";
import Badge, { stepTypeBadgeVariant } from "./ui/Badge";
import EmptyState from "./ui/EmptyState";

interface Props {
  result: ExecutionResult | null;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-xs tracking-[0.15em] text-neon-cyan/80 uppercase mb-3 flex items-center gap-2">
      <span className="w-1 h-1 rounded-full bg-neon-cyan" />
      {children}
    </h3>
  );
}

export default function VizDashboard({ result }: Props) {
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
                    (viz.figure as { layout?: object }).layout as Parameters<typeof withDarkTheme>[0],
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

      {result.preview.length > 0 && (
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
