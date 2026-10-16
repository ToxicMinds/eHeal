// The practitioner's Google Calendar, through the `google` edge function (it holds Google's keys).
import { supabase } from "./supabase";

type Action = "connect" | "refresh" | "disconnect";

/** Asks the edge function to act for the signed-in practitioner. Null when it could not be reached. */
export async function google(action: Action): Promise<{ url?: string; ok?: boolean; error?: string } | null> {
  const { data, error } = await supabase.functions.invoke("google", { body: { action } });
  return error ? null : data;
}

/** Why Google could not be read last time, in the practitioner's words. */
export const GOOGLE_PROBLEM: Record<string, string> = {
  GOOGLE_REVOKED: "Google no longer lets Watson see your calendar. Connect it again.",
  GOOGLE_UNAVAILABLE: "Google did not answer the last check. Watson tries again by itself.",
};
