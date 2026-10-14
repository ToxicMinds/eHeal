"use client";

import { useEffect, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { dateTime } from "@/lib/status";
import { supabase } from "@/lib/supabase";

type Message = Pick<Tables<"whatsapp_messages">, "id" | "direction" | "kind" | "body" | "status" | "created_at">;
const KIND: Record<string, string> = { image: "Photo", document: "Document", audio: "Voice message", other: "Message" };

async function fetchMessages(consultationId: string): Promise<Message[]> {
  const { data } = await supabase.from("whatsapp_messages").select("id, direction, kind, body, status, created_at")
    .eq("consultation_id", consultationId).order("created_at", { ascending: false }).limit(30);
  return (data ?? []).reverse();
}

/** The patient's conversation with Watson's WhatsApp number, newest last. Shown once there is one. */
export function WhatsAppPanel({ consultationId }: { consultationId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    let current = true;
    fetchMessages(consultationId).then((result) => current && setMessages(result));
    return () => {
      current = false;
    };
  }, [consultationId]);

  if (messages.length === 0) return null;
  return (
    <section className="wa-panel" aria-labelledby="whatsapp-title">
      <div className="wa-panel__head">
        <h2 className="wa-heading" id="whatsapp-title">WhatsApp</h2>
        <span className="wa-hint">The patient and Watson&apos;s number</span>
      </div>
      <ol className="wa-chat">
        {messages.map((message) => (
          <li key={message.id} className={`wa-chat__message wa-chat__message--${message.direction}`}>
            <span className="wa-chat__who">
              {message.direction === "in" ? "Patient" : "Watson"} · {dateTime(message.created_at)}
              {message.direction === "out" && message.status === "failed" && " · not delivered"}
            </span>
            <p className="wa-chat__text">
              {message.kind === "text" ? message.body : `${KIND[message.kind]}${message.body ? `: ${message.body}` : ""}`}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
