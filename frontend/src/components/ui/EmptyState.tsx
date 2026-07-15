import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  message: string;
  className?: string;
}

export default function EmptyState({ icon, title, message, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center h-full text-center px-6 ${className}`}>
      {icon && (
        <div className="mb-4 text-neon-cyan/40 text-4xl">{icon}</div>
      )}
      {title && (
        <p className="font-display text-sm tracking-wider text-slate-400 uppercase mb-2">{title}</p>
      )}
      <p className="text-slate-500 text-sm max-w-xs">{message}</p>
    </div>
  );
}
