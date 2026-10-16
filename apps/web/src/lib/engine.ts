// Watson's engine: in the cloud, started by itself when there is work (decision 0009), or on a laptop,
// where transcripts and forms are made only while it is on.
import { supabase } from "./supabase";

/**
 * From the database function engine_status: online when the engine reported in the last minute;
 * on_demand when it runs in the cloud; paused when the cloud engine has used this month's allowance.
 */
export type Engine = { online: boolean; last_seen_at: string | null; on_demand: boolean; paused: boolean };

export async function engineStatus(): Promise<Engine | null> {
  const { data } = await supabase.rpc("engine_status");
  return data as Engine | null;
}
