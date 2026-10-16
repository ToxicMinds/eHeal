// The laptop that runs Watson's engine: transcripts and forms are made only while it is on.
import { supabase } from "./supabase";

/** Online when the engine reported in the last minute (database function engine_status). */
export type Engine = { online: boolean; last_seen_at: string | null };

export async function engineStatus(): Promise<Engine | null> {
  const { data } = await supabase.rpc("engine_status");
  return data as Engine | null;
}
