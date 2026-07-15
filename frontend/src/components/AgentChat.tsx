import { useRef, useState } from "react";
import type { ChatMessage, DatasetProfile } from "../types";
import { generatePipeline, streamChat } from "../lib/api";
import Panel from "./ui/Panel";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { Input } from "./ui/Input";

interface Props {
  sessionId: string | null;
  profile: DatasetProfile | null;
  onPipelineGenerated: () => void;
}

function ShieldIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-typing-dot"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

export default function AgentChat({ sessionId, profile, onPipelineGenerated }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sendMessage = () => {
    if (!sessionId || !input.trim() || streaming) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setStreaming(true);

    let assistantContent = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    abortRef.current = streamChat(
      sessionId,
      userMsg,
      (token) => {
        assistantContent += token;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: assistantContent };
          return updated;
        });
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      },
      () => setStreaming(false),
      (err) => {
        setStreaming(false);
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: `Error: ${err}` },
        ]);
      },
    );
  };

  const handleGenerate = async () => {
    if (!sessionId) return;
    setGenerating(true);
    try {
      await generatePipeline(sessionId);
      onPipelineGenerated();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Pipeline generated! Review it in the canvas and click Run when ready." },
      ]);
    } catch (e: unknown) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Pipeline generation failed: ${e instanceof Error ? e.message : "unknown error"}` },
      ]);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Panel
      title="Agent Chat"
      subtitle="Headers-only analysis — your data stays private"
      icon={<ShieldIcon />}
      className="h-full"
    >
      <div className="flex flex-col flex-1 min-h-0">
      {profile && (
        <div className="p-3 m-3 glass-card neon-border">
          <p className="font-display text-sm tracking-wide text-slate-200">{profile.file_name}</p>
          <p className="text-slate-400 font-mono text-xs mt-1">
            {profile.row_count.toLocaleString()} rows · {profile.column_count} columns
          </p>
          {profile.excel_meta && (
            <p className="text-xs text-slate-500 mt-1 font-mono">
              Excel: {profile.excel_meta.sheet_name} · header row {profile.excel_meta.header_row}
              {profile.excel_meta.merged_cells_resolved > 0 &&
                ` · ${profile.excel_meta.merged_cells_resolved} merges resolved`}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {profile.columns.map((c) => (
              <Badge
                key={c.name}
                variant="cyan"
                title={`${c.dtype}, ${c.null_pct}% null`}
              >
                {c.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {!sessionId && (
          <p className="text-slate-500 text-sm text-center mt-8 font-mono">
            Upload a dataset to start
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg text-sm ${
              msg.role === "user"
                ? "bg-gradient-user-bubble text-white ml-6 shadow-neon-sm"
                : "glass-card mr-6 border-l-2 border-l-neon-cyan/50"
            }`}
          >
            {msg.content || (streaming && i === messages.length - 1 ? <TypingDots /> : "")}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t section-divider glass-panel space-y-2 shrink-0">
        <Button
          variant="success"
          size="md"
          className="w-full"
          onClick={handleGenerate}
          disabled={!sessionId || generating}
        >
          {generating ? "Generating Pipeline..." : "Generate Pipeline"}
        </Button>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="What do you want to analyze?"
            disabled={!sessionId || streaming}
            className="flex-1 !mt-0"
          />
          <Button
            onClick={sendMessage}
            disabled={!sessionId || streaming || !input.trim()}
            size="md"
          >
            Send
          </Button>
        </div>
      </div>
      </div>
    </Panel>
  );
}
