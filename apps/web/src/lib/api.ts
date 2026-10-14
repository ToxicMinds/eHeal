import type { Database } from "./database.types";
import { supabase } from "./supabase";

type Functions = Database["public"]["Functions"];

/** Every database function answers with one of these two shapes, and never throws. */
export type Outcome<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error_category: string; field?: string };

/** Calls a database function. A network or permission failure becomes a refused outcome. */
export async function call<T = object>(
  name: keyof Functions,
  args: Functions[typeof name]["Args"],
): Promise<Outcome<T>> {
  const { data, error } = await supabase.rpc(name, args as never);
  if (error || data === null) return { ok: false, error_category: "STORAGE_UNAVAILABLE" };
  return data as unknown as Outcome<T>;
}

const MESSAGE: Record<string, string> = {
  AUDIO_FILE_MISSING: "No audio arrived. Attach the file again.",
  AUDIO_FORMAT_UNSUPPORTED: "This audio format is not supported. Use wav, mp3, m4a, mp4, flac, ogg or webm.",
  AUDIO_CORRUPT: "The file did not arrive intact. Attach it again.",
  AUDIO_TOO_LARGE: "The file is larger than 50 MB. Use a compressed format such as m4a or mp3.",
  AUDIO_DURATION_INVALID: "The recording is empty or longer than two hours.",
  CONSENT_MISSING: "Record consent before attaching audio.",
  INVALID_STATE_TRANSITION: "That is not possible at this stage of the consultation. Reload the page to see where it stands.",
  NOT_FOUND: "This consultation does not exist, or it is not yours.",
  FORM_NOT_REVIEWED: "Check every answer first: accept, edit or reject it.",
  FORM_TEMPLATE_MISSING: "Your form is not set up yet, so there is nothing to fill in.",
  NOT_SIGNED_IN: "You are signed out. Sign in again.",
  VALIDATION: "One of the values was not accepted. Check the form and try again.",
  STORAGE_UNAVAILABLE: "The service could not be reached. Check your connection and try again.",
};

/** A sentence a practitioner can act on, for any refusal. Never a stack trace. */
export function explain(errorCategory: string): string {
  return MESSAGE[errorCategory] ?? "That did not work, and nothing was changed. Try again.";
}
