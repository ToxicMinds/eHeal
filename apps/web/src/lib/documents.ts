import { explain, type Outcome } from "./api";
import { supabase } from "./supabase";

/** What the engine can read: PDFs, and photos or scans as images. */
const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const DOCUMENT_ACCEPT = DOCUMENT_TYPES.join(",");
const MAX_BYTES = 10 * 1024 * 1024;

type Started = Outcome<{ document_id: string; path: string }>;

/**
 * Sends one file: makes its record, puts the file at the path made for it, then confirms it.
 * Returns a sentence to show when it did not work, or null.
 */
export async function sendDocument(
  file: File,
  start: (mediaType: string) => Promise<Started>,
  confirm: (documentId: string) => Promise<Outcome>,
): Promise<string | null> {
  if (!DOCUMENT_TYPES.includes(file.type)) return explain("DOCUMENT_FORMAT_UNSUPPORTED");
  if (file.size > MAX_BYTES) return explain("DOCUMENT_TOO_LARGE");
  const started = await start(file.type);
  if (!started.ok) return explain(started.error_category);
  const { error } = await supabase.storage.from("documents").upload(started.path, file, { contentType: file.type });
  if (error) return explain("DOCUMENT_FILE_MISSING");
  const confirmed = await confirm(started.document_id);
  return confirmed.ok ? null : explain(confirmed.error_category);
}

/** Opens a document in a new tab, through a link that works for one minute. */
export async function openDocument(path: string): Promise<boolean> {
  const opened = window.open("", "_blank");
  const { data } = await supabase.storage.from("documents").createSignedUrl(path, 60);
  if (!data?.signedUrl) {
    opened?.close();
    return false;
  }
  if (opened) opened.location.href = data.signedUrl;
  else window.location.assign(data.signedUrl);
  return true;
}

/** "340 KB", "1.8 MB". */
export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
