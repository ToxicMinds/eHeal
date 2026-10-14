import { describe, expect, it } from "vitest";
import { Constants } from "./database.types";
import { STAGES, summarise } from "./status";

describe("summarise", () => {
  it("has a plain label and four stages for every status the database knows", () => {
    for (const status of Constants.public.Enums.consultation_status) {
      const { label, stages } = summarise(status);
      expect(label.length).toBeGreaterThan(3);
      expect(stages).toHaveLength(STAGES.length);
    }
  });

  it("never shows a later stage as done before an earlier one", () => {
    for (const status of Constants.public.Enums.consultation_status) {
      const { stages } = summarise(status);
      const firstUnfinished = stages.findIndex((stage) => stage !== "done");
      if (firstUnfinished >= 0) expect(stages.slice(firstUnfinished)).not.toContain("done");
    }
  });

  it("marks a failed transcription on the transcript stage", () => {
    expect(summarise("transcription_failed")).toMatchObject({
      label: "Transcription failed",
      stages: ["done", "done", "failed", "pending"],
    });
  });
});
