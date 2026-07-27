import React from "react";
import type { TierName } from "../types";

interface TierBadgeProps {
  tier?: TierName | string;
  onClick?: () => void;
  showUpgradeBtn?: boolean;
}

export default function TierBadge({ tier = "explorer", onClick, showUpgradeBtn = true }: TierBadgeProps) {
  const normalizedTier = tier.toLowerCase();

  const getTierStyles = () => {
    switch (normalizedTier) {
      case "studio":
        return {
          bg: "bg-gradient-to-r from-amber-500/20 to-purple-600/20 border-amber-500/40 text-amber-300",
          glow: "shadow-[0_0_12px_rgba(245,166,35,0.25)]",
          label: "Studio",
          icon: "⚡",
        };
      case "analyst":
        return {
          bg: "bg-neon-cyan/15 border-neon-cyan/40 text-neon-cyan",
          glow: "shadow-[0_0_12px_rgba(34,211,238,0.25)]",
          label: "Analyst",
          icon: "🚀",
        };
      default:
        return {
          bg: "bg-slate-800/80 border-slate-700 text-slate-400",
          glow: "",
          label: "Explorer",
          icon: "🌱",
        };
    }
  };

  const style = getTierStyles();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border transition-all ${style.bg} ${style.glow} hover:scale-105 active:scale-95 cursor-pointer`}
        title="View plan & billing settings"
        id="tier-badge-btn"
      >
        <span>{style.icon}</span>
        <span className="capitalize">{style.label}</span>
      </button>
      {normalizedTier === "explorer" && showUpgradeBtn && (
        <button
          onClick={onClick}
          className="text-[11px] font-mono text-neon-cyan hover:text-cyan-300 underline underline-offset-2 transition-colors cursor-pointer"
        >
          Upgrade
        </button>
      )}
    </div>
  );
}
