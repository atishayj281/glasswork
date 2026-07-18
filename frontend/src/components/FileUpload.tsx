import { useCallback, useState } from "react";
import type { DatasetProfile } from "../types";
import { uploadAndIngest } from "../lib/api";
import { Input } from "./ui/Input";

interface Props {
  onUploaded: (sessionId: string, profile: DatasetProfile) => void;
}

export default function FileUpload({ onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [headerRow, setHeaderRow] = useState<string>("");

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      setProgress(0);
      try {
        // Send file directly to backend — backend uploads to Supabase with service role key
        setProgress(20);
        const opts =
          headerRow.trim() !== "" && !Number.isNaN(Number(headerRow))
            ? { headerRow: Number(headerRow) }
            : undefined;
        setProgress(50);
        const { session_id, profile } = await uploadAndIngest(file, opts);
        setProgress(100);
        onUploaded(session_id, profile);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setLoading(false);
        setProgress(0);
      }
    },
    [onUploaded, headerRow],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="p-4 space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300
          ${dragging
            ? "border-neon-cyan bg-cyan-950/30 shadow-neon-md neon-glow"
            : "border-slate-600/50 glass-card neon-border"
          }
          ${loading ? "shimmer-bg" : ""}
        `}
      >
        <div className="mb-3 text-neon-cyan/60">
          <svg className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        <p className="text-slate-300 mb-1 font-medium">
          Drop a CSV or Excel file here, or click to browse
        </p>
        <p className="text-xs text-slate-500 mb-4 font-mono">
          Merged Excel cells are auto-resolved · Files stored in Cloud Storage
        </p>

        {loading && (
          <div className="w-full bg-slate-700/50 rounded-full h-1.5 mb-4 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-neon-cyan to-neon-violet transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          id="file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <label
          htmlFor="file-input"
          className={`
            inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg cursor-pointer
            bg-gradient-primary text-white shadow-neon-sm hover:shadow-neon-md border border-neon-cyan/30
            transition-all duration-200
            ${loading ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}
          `}
        >
          {loading ? `Uploading… ${progress}%` : "Choose File"}
        </label>
        {error && <p className="text-red-400 mt-3 text-sm font-mono">{error}</p>}
      </div>

      <div className="flex items-center gap-3 text-sm">
        <label htmlFor="header-row" className="text-slate-400 whitespace-nowrap font-mono text-xs">
          Header row (0-based):
        </label>
        <Input
          id="header-row"
          type="number"
          min={0}
          value={headerRow}
          onChange={(e) => setHeaderRow(e.target.value)}
          placeholder="auto"
          className="w-24 !mt-0"
        />
      </div>
    </div>
  );
}
