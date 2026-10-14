# Journey

The four steps every consultation goes through in phase 1 (Consent, Audio, Transcript, Review), as four bars with a word under each. It sits under the page title of a consultation.

- `done`: ink bar, a check, and what happened ("Recorded 13 Oct"). `current`: practitioner bar and name, with what it waits for ("Waiting for the patient track"). `attention`: turmeric bar, for a step waiting on the practitioner to check ("Ready to review"). `failed`: madder bar and words ("Failed: no speech found"). `pending`: rule bar and "Not yet".
- Exactly one step is `current`, `attention` or `failed`, unless all are done.
- Below 560px wide only the step names show; the current state is repeated in the panel below.

The consumer provides: the four step states (the app's `summarise()`) and a short state line for each.
