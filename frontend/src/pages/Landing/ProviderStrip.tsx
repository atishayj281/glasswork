import React, { useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Check, Terminal, Shield, Sparkles } from "lucide-react";

interface ProviderItem {
  id: string;
  name: string;
  badge: string;
  defaultModel: string;
  envSnippet: string;
  tagline: string;
}

const PROVIDERS: ProviderItem[] = [
  {
    id: "openai",
    name: "OpenAI",
    badge: "Cloud LLM",
    defaultModel: "gpt-4o",
    envSnippet: `LITELLM_MODEL=gpt-4o\nOPENAI_API_KEY=sk-prod-...`,
    tagline: "High precision DAG generation & multi-turn intent reasoning."
  },
  {
    id: "anthropic",
    name: "Anthropic",
    badge: "Cloud LLM",
    defaultModel: "claude-3-5-sonnet",
    envSnippet: `LITELLM_MODEL=claude-3-5-sonnet\nANTHROPIC_API_KEY=sk-ant-...`,
    tagline: "Complex analytical queries & structured JSON schema generation."
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    badge: "Air-Gapped / Offline",
    defaultModel: "ollama/llama3",
    envSnippet: `LITELLM_MODEL=ollama/llama3\nOLLAMA_API_BASE=http://localhost:11434`,
    tagline: "100% offline analysis. Zero cloud requests or external API keys needed."
  }
];

export default function ProviderStrip() {
  const [selectedProviderId, setSelectedProviderId] = useState<string>("openai");
  const selectedProvider = PROVIDERS.find((p) => p.id === selectedProviderId) || PROVIDERS[0];

  return (
    <section className="w-full my-16 p-6 sm:p-8 rounded-xl bg-[#12161F] border border-cyan-500/20 relative overflow-hidden">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-cyan-500/15">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#4DD9C4] uppercase font-semibold tracking-wider">
              PROVIDER-AGNOSTIC LLM LAYER
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/30">
              Powered by LiteLLM
            </span>
          </div>
          <h3 className="font-display text-2xl font-bold text-[#E7E9EE] mt-1">
            Bring Your Own Model or Run 100% Offline
          </h3>
        </div>

        {/* Provider Switcher Tabs */}
        <div className="flex bg-[#0B0E14] p-1 rounded-lg border border-white/10 shrink-0">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              onClick={() => setSelectedProviderId(provider.id)}
              className={`px-3 py-1.5 rounded-md font-mono text-xs transition-all ${
                selectedProviderId === provider.id
                  ? "bg-[#4DD9C4]/20 text-[#4DD9C4] font-bold border border-[#4DD9C4]/40"
                  : "text-[#8B92A3] hover:text-[#E7E9EE]"
              }`}
            >
              {provider.name}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Provider Details */}
      <motion.div 
        key={selectedProvider.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center"
      >
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-5 h-5 text-[#F5A623]" />
            <span className="font-display text-lg font-bold text-[#E7E9EE]">
              {selectedProvider.name}
            </span>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {selectedProvider.badge}
            </span>
          </div>

          <p className="text-sm text-[#8B92A3] font-sans mt-2">
            {selectedProvider.tagline}
          </p>

          <div className="mt-4 flex items-center gap-4 text-xs font-mono text-[#E7E9EE]">
            <div className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-[#4DD9C4]" />
              <span>Default: <code className="text-[#4DD9C4]">{selectedProvider.defaultModel}</code></span>
            </div>
          </div>
        </div>

        {/* Env Config Snippet */}
        <div className="bg-[#0B0E14] p-4 rounded-lg border border-white/10 font-mono text-xs">
          <div className="flex items-center justify-between text-[#8B92A3] pb-2 mb-2 border-b border-white/5 text-[11px]">
            <span className="flex items-center gap-1">
              <Terminal className="w-3.5 h-3.5 text-[#F5A623]" />
              backend/.env Configuration
            </span>
            <span>LiteLLM Router</span>
          </div>
          <pre className="text-[#4DD9C4] overflow-x-auto text-[11px] leading-relaxed">
            {selectedProvider.envSnippet}
          </pre>
        </div>
      </motion.div>
    </section>
  );
}
