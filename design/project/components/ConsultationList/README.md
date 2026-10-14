# ConsultationList

The practitioner's consultations, grouped by who has to act next: "Needs you", "Transcribing", "Done". Each row opens its consultation.

- A row shows the patient reference (mono), the date and language, the scenario note on one line, and the StatusChip.
- "Needs you" holds everything waiting on the practitioner: consent, audio, ready to transcribe, ready to review, failed. Groups with nothing in them are hidden. Newest first within a group.
- Loading: three skeleton rows, `aria-busy="true"` on the list and "Loading your consultations" for screen readers.
- Empty: "No consultations yet. Create one to attach audio and get a transcript." with the "New consultation" button.

The consumer provides: for each consultation its reference, date and time, language, note, status label and tone, and its link.
