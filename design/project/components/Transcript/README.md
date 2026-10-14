# Transcript

The conversation as one column of turns, with two rails down its left edge: eHeal's signature.

- Each turn shows the speaker ("Practitioner" in `practitioner`, "Patient" in `patient`), its start time in `mono`, and what was said in `transcript` type.
- The rails are the two audio tracks laid on their side: the left rail is the patient's, the right one the practitioner's. A turn lights its speaker's rail. A turn that overlaps the other speaker lights both rails and carries the "Overlaps" tag.
- An uncertain word is a `<mark class="eh-unsure">` with an accessible description ("low confidence, check against the audio"). In review it takes focus, so the practitioner can tab from one to the next.
- A turn that may not be speech (a cough, a chair, a "mm") is `eh-turn--unsure`: muted italic text and the "May not be speech" tag.
- Approximate order: add `eh-turns--approximate` (dashed rails) and a neutral Notice above: "The order of turns is a best guess."
- Above the turns: the counts ("9 turns · 2 words to check · 1 overlap") and a legend for the rails and the mark.

The consumer provides: the segments (speaker, start time, text, low-confidence words, possibly-not-speech, overlap) and the transcript's ordering, exact or approximate.
