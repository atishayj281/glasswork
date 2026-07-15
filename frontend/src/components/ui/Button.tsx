import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "success" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-primary text-white shadow-neon-sm hover:shadow-neon-md border border-neon-cyan/30",
  secondary:
    "glass-panel text-slate-200 hover:border-neon-cyan/40 hover:shadow-neon-sm",
  ghost:
    "bg-transparent text-slate-400 hover:text-neon-cyan hover:bg-slate-800/50 border border-transparent",
  success:
    "bg-gradient-success text-white shadow-glow-emerald hover:shadow-neon-md border border-neon-emerald/30",
  danger:
    "bg-red-900/50 text-red-300 border border-red-500/30 hover:bg-red-900/70",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-2.5 text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 rounded-lg font-medium
        transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
        ${variantClasses[variant]} ${sizeClasses[size]} ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
