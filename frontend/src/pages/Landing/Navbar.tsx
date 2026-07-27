import React from "react";
import { Activity, Play } from "lucide-react";

interface NavbarProps {
  onLaunchStudio: () => void;
  onViewPricing?: () => void;
}

export default function Navbar({ onLaunchStudio, onViewPricing }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-[#0B0E14]/85 border-b border-cyan-500/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand Logo & Telemetry Indicator */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F5A623] to-[#4DD9C4] p-[1px] shadow-[0_0_12px_rgba(245,166,35,0.3)]">
              <div className="w-full h-full bg-[#0B0E14] rounded-[7px] flex items-center justify-center">
                <Activity className="w-4 h-4 text-[#F5A623]" />
              </div>
            </div>
            <div>
              <span className="font-display font-bold text-lg text-[#E7E9EE] tracking-wider block leading-none">
                GLASSWORK
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-white/10 text-xs font-mono text-[#8B92A3]">
            <span className="w-2 h-2 rounded-full bg-[#4DD9C4] animate-pulse" />
            <span>v0.1.0 • Schema-Only Engine</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Pricing link */}
          <button
            onClick={onViewPricing ?? (() => {
              document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
            })}
            className="hidden sm:flex items-center px-3.5 py-1.5 rounded-lg border border-white/10 hover:border-cyan-500/40 text-[#8B92A3] hover:text-[#E7E9EE] font-mono text-xs font-medium transition-all"
          >
            Pricing
          </button>

          {/* Secondary Ghost CTA to GitHub */}
          <a
            href="https://github.com/atishayj281/aegis-pipeline-studio"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-lg border border-cyan-500/30 bg-[#12161F]/80 hover:bg-[#12161F] hover:border-[#4DD9C4] text-[#E7E9EE] font-mono text-xs font-medium transition-all flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]"
            title="View Source on GitHub"
          >
            <svg className="w-3.5 h-3.5 text-[#8B92A3] fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span className="hidden sm:inline">GitHub</span>
          </a>

          {/* Primary Amber Solid CTA */}
          <button
            onClick={onLaunchStudio}
            className="px-4 py-1.5 rounded-lg bg-[#F5A623] hover:bg-[#f5a623]/90 text-[#0B0E14] font-mono text-xs font-bold transition-all shadow-[0_0_15px_rgba(245,166,35,0.3)] hover:shadow-[0_0_20px_rgba(245,166,35,0.5)] active:scale-95 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]"
          >
            <Play className="w-3.5 h-3.5 fill-[#0B0E14]" />
            <span>Launch Studio</span>
          </button>
        </div>

      </div>
    </header>
  );
}
