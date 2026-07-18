import axios from "axios";
import { auth } from "./firebase";
import type { DatasetProfile, ExecutionResult, PipelinePlan } from "../types";

const api = axios.create({ baseURL: "/api" });

// Attach Firebase ID token to every request
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface UploadOptions {
  headerRow?: number;
  sheetIndex?: number;
}

/**
 * Upload a file directly to the backend as multipart/form-data.
 * The backend stores it in Supabase Storage (using service role key, bypassing RLS)
 * and immediately ingests it into a session.
 */
export async function uploadAndIngest(
  file: File,
  options?: UploadOptions,
): Promise<{ session_id: string; profile: DatasetProfile; process_on_client: boolean }> {
  const params = new URLSearchParams();
  if (options?.headerRow !== undefined)
    params.set("header_row", String(options.headerRow));
  if (options?.sheetIndex !== undefined)
    params.set("sheet_index", String(options.sheetIndex));

  const formData = new FormData();
  formData.append("file", file);

  const qs = params.toString();
  // Do NOT set Content-Type manually — axios sets multipart/form-data with the
  // correct boundary automatically when it detects a FormData body.
  const { data } = await api.post<{ session_id: string; profile: DatasetProfile; process_on_client: boolean }>(
    qs ? `/upload?${qs}` : "/upload",
    formData,
  );
  return data;
}

/** Associate an anonymous (pre-login) session with the now-authenticated user. */
export async function claimSession(sessionId: string) {
  await api.post(`/sessions/${sessionId}/claim`);
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
  const { data } = await api.post<{ status: string }>(`/pipeline/${sessionId}/execute`);
  return data;
}

export async function getExecutionStatus(sessionId: string) {
  const { data } = await api.get<{ status: string; error: string | null; result: ExecutionResult | null }>(`/pipeline/${sessionId}/status`);
  return data;
}

export async function downloadDataset(sessionId: string) {
  const { data } = await api.get<Record<string, any>[]>(`/session/${sessionId}/download`);
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

  (async () => {
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : null;
      const res = await fetch(`/api/chat/${sessionId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });
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
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") onError(err.message);
    }
  })();

  return () => controller.abort();
}
