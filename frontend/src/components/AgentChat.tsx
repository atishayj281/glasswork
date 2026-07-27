import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { ChatMessage, DatasetProfile } from "../types";
import { generatePipeline, streamChat } from "../lib/api";
import Panel from "./ui/Panel";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { Input } from "./ui/Input";

/** Custom component map for react-markdown — applies design-system styles */
const markdownComponents: Components = {
  // Paragraphs
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed text-slate-200">{children}</p>
  ),
  // Headings
  h1: ({ children }) => (
    <h1 className="text-base font-bold text-neon-cyan mb-2 mt-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-bold text-neon-cyan mb-1 mt-3 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-slate-100 mb-1 mt-2 first:mt-0">{children}</h3>
  ),
  // Unordered list
  ul: ({ children }) => (
    <ul className="list-disc list-outside pl-4 mb-2 space-y-0.5 text-slate-200">{children}</ul>
  ),
  // Ordered list
  ol: ({ children }) => (
    <ol className="list-decimal list-outside pl-4 mb-2 space-y-0.5 text-slate-200">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  // Inline code
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className);
    if (isBlock) {
      return (
        <code
          className="block bg-slate-900/80 border border-slate-700/60 rounded-md px-3 py-2 my-2 font-mono text-xs text-emerald-300 overflow-x-auto whitespace-pre"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="bg-slate-800/70 border border-slate-700/50 rounded px-1 py-0.5 font-mono text-xs text-emerald-300"
        {...props}
      >
        {children}
      </code>
    );
  },
  // Fenced code block wrapper
  pre: ({ children }) => (
    <pre className="my-2 rounded-md overflow-x-auto bg-slate-900/80 border border-slate-700/60">
      {children}
    </pre>
  ),
  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-neon-cyan/50 pl-3 my-2 text-slate-400 italic">
      {children}
    </blockquote>
  ),
  // Table
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse border border-slate-700/60 rounded-md">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-slate-800/60 text-neon-cyan">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-slate-700/40 even:bg-slate-800/20">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-2 py-1.5 text-left font-semibold border-r border-slate-700/40 last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1 text-slate-300 border-r border-slate-700/30 last:border-r-0">
      {children}
    </td>
  ),
  // Horizontal rule
  hr: () => <hr className="border-slate-700/50 my-3" />,
  // Bold / italic
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-100">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-neon-cyan underline underline-offset-2 hover:text-cyan-300 transition-colors"
    >
      {children}
    </a>
  ),
};

/** Render assistant response content as formatted Markdown */
function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
}

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
            {msg.role === "assistant" ? (
            msg.content ? (
              <MarkdownContent content={msg.content} />
            ) : streaming && i === messages.length - 1 ? (
              <TypingDots />
            ) : null
          ) : (
            msg.content
          )}
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
