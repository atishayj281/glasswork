import { useState } from "react";
import type { DatasetProfile, ExecutionResult } from "./types";
import FileUpload from "./components/FileUpload";
import AgentChat from "./components/AgentChat";
import PipelineCanvas from "./components/PipelineCanvas";
import VizDashboard from "./components/VizDashboard";
import Button from "./components/ui/Button";

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [pipelineRefresh, setPipelineRefresh] = useState(0);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [showUpload, setShowUpload] = useState(true);

  const handleUploaded = (id: string, prof: DatasetProfile) => {
    setSessionId(id);
    setProfile(prof);
    setShowUpload(false);
    setResult(null);
  };

  return (
    <div className="h-screen flex flex-col grid-bg overflow-hidden">
      <header className="glass-panel border-b section-divider px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-display text-xl font-bold tracking-[0.2em] gradient-text">
              AEGIS
            </h1>
            <p className="font-mono text-[10px] text-slate-500 tracking-widest uppercase mt-0.5">
              Agentic Data Platform
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-700/50">
            <span
              className={`w-2 h-2 rounded-full ${
                sessionId ? "bg-neon-emerald animate-pulse-glow" : "bg-slate-600"
              }`}
            />
            <span className="text-xs font-mono text-slate-500">
              {sessionId ? "Session Active" : "Ready"}
            </span>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowUpload(!showUpload)}
        >
          {showUpload ? "Hide Upload" : "Upload New File"}
        </Button>
      </header>

      {showUpload && (
        <div className="shrink-0 border-b section-divider">
          <FileUpload onUploaded={handleUploaded} />
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <div className="w-96 border-r section-divider glass-panel flex flex-col min-h-0">
          <AgentChat
            sessionId={sessionId}
            profile={profile}
            onPipelineGenerated={() => setPipelineRefresh((k) => k + 1)}
          />
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 border-b section-divider">
            <PipelineCanvas
              sessionId={sessionId}
              refreshKey={pipelineRefresh}
              onExecuted={setResult}
            />
          </div>
          <div className="h-80 min-h-0 glass-panel">
            <VizDashboard result={result} />
          </div>
        </div>
      </div>
    </div>
  );
}
