import { Cloud, Laptop } from "lucide-react";
import type { ReactNode } from "react";
import { Notice } from "@/components/status";
import type { Engine } from "@/lib/engine";
import { dateTime } from "@/lib/status";

// Where Watson's engine works: in the cloud, started by itself when there is work (decision 0009),
// or on a laptop, only while the laptop is on.
const WAIT = "Transcripts and forms wait until the 1st.";

/** On Home: whether Watson's engine can work now (design system: ScreenHomeBooked). */
export function EngineStatus({ engine }: { engine: Engine }) {
  if (engine.on_demand) {
    const icon = <Cloud aria-hidden className="wa-icon wa-icon--sm" />;
    if (engine.paused) return <span className="wa-laptop wa-laptop--off">{icon}Watson&apos;s engine is paused: this month&apos;s allowance is used. {WAIT}</span>;
    return (
      <span className="wa-laptop">{icon}
        {engine.online ? "Watson's engine is working" : "Watson's engine is ready: it starts by itself when there is work"}
      </span>
    );
  }
  const since = engine.last_seen_at ? ` since ${dateTime(engine.last_seen_at)}` : "";
  return engine.online ? (
    <span className="wa-laptop"><Laptop aria-hidden className="wa-icon wa-icon--sm" />Watson&apos;s laptop is on</span>
  ) : (
    <span className="wa-laptop wa-laptop--off">
      <Laptop aria-hidden className="wa-icon wa-icon--sm" />Watson&apos;s laptop is off{since}: transcripts and forms wait until it is back
    </span>
  );
}

/** While Watson works on a consultation: the engine's last report, or what waits and why. */
export function EngineLine({ engine, now, waiting }: { engine: Engine | null; now: number; waiting: ReactNode }) {
  const Icon = engine?.on_demand ? Cloud : Laptop;
  if (engine?.on_demand && engine.paused) {
    return <Notice tone="attention" title="Watson's engine is paused">This month&apos;s allowance is used. {WAIT} Nothing is lost.</Notice>;
  }
  if (engine?.on_demand && !engine.online) {
    return <p className="wa-engine"><Icon aria-hidden className="wa-icon wa-icon--sm" />Watson&apos;s engine is starting. This takes about a minute.</p>;
  }
  if (!engine?.online) return <Notice tone="attention" title="Watson's laptop is off">{waiting}</Notice>;
  const seconds = engine.last_seen_at ? Math.max(0, Math.round((now - Date.parse(engine.last_seen_at)) / 1000)) : null;
  return (
    <p className="wa-engine"><Icon aria-hidden className="wa-icon wa-icon--sm" />
      {engine.on_demand ? "Watson's engine is working" : "Watson's laptop is on"}{seconds === null ? "" : ` · last report ${seconds} s ago`}</p>
  );
}
