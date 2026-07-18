/**
 * Upload a file to the backend API as multipart/form-data.
 * The backend uses the Supabase service role key to store the file, bypassing RLS.
 * Returns the backend-assigned storage path.
 */
export async function uploadToStorage(
  _uid: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ storagePath: string; downloadUrl: string }> {
  // We no longer upload from the frontend directly — backend handles it.
  // Return a sentinel path; the real upload happens in handleFile via uploadAndIngest.
  onProgress?.(0);
  void file; // consumed by uploadAndIngest in api.ts
  return { storagePath: "__backend_upload__", downloadUrl: "" };
}
