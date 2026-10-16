import { Laptop } from "lucide-react";
import type { ReactNode } from "react";
import { Notice } from "@/components/status";
import type { Engine } from "@/lib/engine";
import { dateTime } from "@/lib/status";

/** On Home: whether Watson's laptop is on (design system: ScreenHomeBooked). */
export function LaptopStatus({ engine }: { engine: Engine }) {
  const since = engine.last_seen_at ? ` since ${dateTime(engine.last_seen_at)}` : "";
  return engine.online ? (
    <span className="wa-laptop"><Laptop aria-hidden className="wa-icon wa-icon--sm" />Watson&apos;s laptop is on</span>
  ) : (
    <span className="wa-laptop wa-laptop--off">
      <Laptop aria-hidden className="wa-icon wa-icon--sm" />Watson&apos;s laptop is off{since}: transcripts and forms wait until it is back
    </span>
  );
}

/** While Watson works on a consultation: the laptop's last report, or what waits while it is off. */
export function LaptopLine({ engine, now, waiting }: { engine: Engine | null; now: number; waiting: ReactNode }) {
  if (!engine?.online) return <Notice tone="attention" title="Watson's laptop is off">{waiting}</Notice>;
  const seconds = engine.last_seen_at ? Math.max(0, Math.round((now - Date.parse(engine.last_seen_at)) / 1000)) : null;
  return (
    <p className="wa-engine"><Laptop aria-hidden className="wa-icon wa-icon--sm" />
      Watson&apos;s laptop is on{seconds === null ? "" : ` · last report ${seconds} s ago`}</p>
  );
}
