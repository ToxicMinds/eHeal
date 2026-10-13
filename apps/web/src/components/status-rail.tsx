import { STAGES, summarise, type ConsultationStatus, type StageState } from "@/lib/status";

// Shape as well as colour carries the state, so it reads without colour vision.
const PIP: Record<StageState, string> = {
  done: "bg-practitioner border-practitioner",
  current: "bg-card border-practitioner border-2",
  failed: "bg-madder border-madder rotate-45 rounded-none",
  pending: "bg-card border-input border-dashed",
};

/** One line that says where a consultation is: consent, audio, transcript, review. */
export function StatusRail({ status }: { status: ConsultationStatus }) {
  const { label, stages } = summarise(status);
  const failed = stages.includes("failed");
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <ol aria-hidden="true" className="flex items-center gap-1.5">
        {STAGES.map((stage, index) => (
          <li
            key={stage}
            title={`${stage}: ${stages[index]}`}
            className={`size-3 rounded-full border ${PIP[stages[index]]}`}
          />
        ))}
      </ol>
      <span className={failed ? "font-semibold text-madder" : undefined}>
        {failed ? "Problem: " : ""}
        {label}
      </span>
    </div>
  );
}
