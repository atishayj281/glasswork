import axios from "axios";
import type {
  DatasetProfile,
  ExecutionResult,
  PipelinePlan,
} from "../types";

const api = axios.create({ baseURL: "/api" });

export interface UploadOptions {
  headerRow?: number;
  sheetIndex?: number;
}

export async function uploadFile(file: File, options?: UploadOptions) {
  const form = new FormData();
  form.append("file", file);
  const params = new URLSearchParams();
  if (options?.headerRow !== undefined) {
    params.set("header_row", String(options.headerRow));
  }
  if (options?.sheetIndex !== undefined) {
    params.set("sheet_index", String(options.sheetIndex));
  }
  const qs = params.toString();
  const url = qs ? `/upload?${qs}` : "/upload";
  const { data } = await api.post<{ session_id: string; profile: DatasetProfile }>(
    url,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function getProfile(sessionId: string) {
  const { data } = await api.get<DatasetProfile>(`/session/${sessionId}/profile`);
  return data;
}

export async function getPipeline(sessionId: string) {
  const { data } = await api.get<PipelinePlan | null>(`/pipeline/${sessionId}`);
  return data;
}

export async function updatePipeline(sessionId: string, plan: PipelinePlan) {
  const { data } = await api.patch<PipelinePlan>(`/pipeline/${sessionId}`, plan);
  return data;
}

export async function generatePipeline(sessionId: string, intent?: string) {
  const { data } = await api.post<PipelinePlan>(`/pipeline/${sessionId}/generate`, {
    intent,
  });
  return data;
}

export async function executePipeline(sessionId: string) {
  const { data } = await api.post<ExecutionResult>(`/pipeline/${sessionId}/execute`);
  return data;
}

export function streamChat(
  sessionId: string,
  message: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
) {
  const controller = new AbortController();

  fetch(`/api/chat/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.token) onToken(payload.token);
            if (payload.done) onDone();
            if (payload.error) onError(payload.error);
          } catch {
            /* skip malformed */
          }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") onError(err.message);
    });

  return () => controller.abort();
}
