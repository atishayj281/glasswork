/**
 * ProgressBar — Reusable loading progress bar.
 *
 * Variants:
 *   - determinate   : filled to `value` (0-100)
 *   - indeterminate : animated sweep (unknown duration)
 *   - pulse         : slow subtle pulse for very long operations
 */

interface Props {
  /** 0-100 for determinate, ignored otherwise */
  value?: number;
  variant?: "determinate" | "indeterminate" | "pulse";
  /** Height in Tailwind units, e.g. "h-1" or "h-1.5" */
  height?: string;
  /** Extra wrapper classes */
  className?: string;
  /** Optional label shown beneath the bar */
  label?: string;
}

export default function ProgressBar({
  value = 0,
  variant = "indeterminate",
  height = "h-1",
  className = "",
  label,
}: Props) {
  return (
    <div className={`w-full ${className}`}>
      <div
        className={`w-full ${height} rounded-full bg-slate-700/40 overflow-hidden relative`}
      >
        {variant === "determinate" && (
          <div
            className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-neon-cyan to-neon-violet transition-all duration-300 ease-out`}
            style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          />
        )}

        {variant === "indeterminate" && (
          <div className="absolute inset-0 progress-indeterminate" />
        )}

        {variant === "pulse" && (
          <div className="absolute inset-0 progress-pulse" />
        )}
      </div>

      {label && (
        <p className="text-[10px] font-mono text-slate-500 mt-1 text-center">
          {label}
        </p>
      )}
    </div>
  );
}
