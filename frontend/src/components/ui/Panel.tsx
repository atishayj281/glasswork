import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  noPadding?: boolean;
}

export default function Panel({
  title,
  subtitle,
  icon,
  children,
  className = "",
  headerClassName = "",
  noPadding = false,
}: PanelProps) {
  return (
    <div className={`flex flex-col h-full ${className}`}>
      {(title || subtitle) && (
        <div className={`px-4 py-3 border-b section-divider ${headerClassName}`}>
          <div className="flex items-center gap-2">
            {icon && <span className="text-neon-cyan">{icon}</span>}
            <div>
              {title && (
                <h2 className="font-display font-semibold text-sm tracking-wider text-slate-100 uppercase">
                  {title}
                </h2>
              )}
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
        </div>
      )}
      <div className={`flex-1 min-h-0 flex flex-col ${noPadding ? "" : ""}`}>{children}</div>
    </div>
  );
}
