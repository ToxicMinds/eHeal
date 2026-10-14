# JobProgress

What the transcription engine is doing right now, stage by stage, how long it has taken, and whether the engine is running.

- Stages in order: "Waiting for the engine" (queued), "Checking the audio" (`validating`), "Transcribing the practitioner track", "Transcribing the patient track", "Putting the turns in order" (`merging`).
- Finished stages show a check and the time they took. The current stage is practitioner and bold. A failed stage is oxblood, with the reason in a `failed` Notice below.
- The moving bar says the engine is working, not how far along it is. The clock is the time so far.
- The engine line says when it last reported ("Engine online · last report 12 s ago"). After 60 seconds without a report it becomes an `attention` Notice.
- "Cancel" only while waiting for the engine. "You can leave this page" is always said.

The consumer provides: the job's stage and stage times, and the engine's last report time.
