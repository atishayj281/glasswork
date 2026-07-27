type BadgeVariant = "default" | "cyan" | "violet" | "emerald" | "orange" | "purple" | "blue";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  title?: string;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-slate-800/80 text-slate-300 border-slate-600/50",
  cyan: "bg-cyan-950/60 text-neon-cyan border-neon-cyan/30",
  violet: "bg-violet-950/60 text-neon-violet border-neon-violet/30",
  emerald: "bg-emerald-950/60 text-neon-emerald border-neon-emerald/30",
  orange: "bg-orange-950/60 text-orange-400 border-orange-500/30",
  purple: "bg-purple-950/60 text-purple-400 border-purple-500/30",
  blue: "bg-blue-950/60 text-blue-400 border-blue-500/30",
};

export default function Badge({ children, variant = "default", title, className = "" }: BadgeProps) {
  return (
    <span
      title={title}
      className={`
        inline-block px-2 py-0.5 rounded text-xs font-mono border
        ${variantClasses[variant]} ${className}
      `}
    >
      {children}
    </span>
  );
}

export function stepTypeBadgeVariant(type: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    filter: "orange",
    groupby_agg: "purple",
    visualize: "emerald",
    sort: "blue",
    select_columns: "cyan",
    rename: "violet",
    fill_na: "default",
    cast_type: "default",
    deduplicate: "default",
    compute_column: "cyan",
    compare_groups: "orange",
    correlation: "violet",
  };
  return map[type] ?? "default";
}
