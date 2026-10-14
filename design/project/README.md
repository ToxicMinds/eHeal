Watson helps Ayurveda and integrative-care practitioners run their practice online: patients book and pay, practitioner and patient meet by video, and Watson writes the transcript and fills in the practitioner's own form for them to check and approve. Every screen serves a practitioner between consultations who needs three answers fast: what needs me, what is the machine unsure of, and what happens next.

## The name

Sherlock Holmes solved the cases; Dr John Watson, a doctor, sat in on every one. He listened, wrote everything down and turned it into the record. Sherlock was a doctor's idea too: Arthur Conan Doyle, himself a physician, modelled him on his teacher Joseph Bell, an Edinburgh surgeon who could read a patient's illness from one conversation. Here the practitioner is Sherlock and the app is their Watson: it sits in on the consultation, keeps every word and drafts the notes. Like Watson's, its guesses are suggestions; the practitioner decides. The palette is Baker Street at night: ink navy for the name and the practitioner, bottle green for the patient, lamplight for what needs a second look, London fog for everything else, and oxblood for what failed.

## Principles

1. **Two voices, never blended.** The practitioner's voice is `practitioner` (ink navy, the colour of the name), the patient's is `patient` (bottle green). A voice keeps its colour on every screen: its track, its rail, its label. Nothing else uses green, so green never means "success".
2. **Show what the machine does not know.** A word the engine is unsure of gets the lamp mark (`lamp-tint` wash, `lamp-mark` underline). Nothing is smoothed over, guessed or filled in.
3. **One next step.** Each consultation screen leads with the one thing to do now, as a primary button. A screen has at most one primary button.
4. **Paper on a desk.** Documents and forms sit on `paper` panels with a `rule` border and `shadow-paper`, on a `ground` page. No other shadows, gradients or decorative fills.
5. **Plain words, no internals.** Hashes, IDs, job states and error codes stay off the main view. When the record needs one (the file's SHA-256, a failure category), it sits under a "Details" disclosure.

## Content fundamentals

- **Who is who.** Address the practitioner as "you". Label tracks and transcript turns "Practitioner" and "Patient"; the transcript is a record, so it names roles, not people.
- **Case and punctuation.** Sentence case everywhere, including buttons and headings. No exclamation marks, no emoji.
- **Buttons say what happens.** "Create consultation", "Start transcription", "Remove patient audio". The result repeats the verb: "Consultation created".
- **Status says where things stand, in the practitioner's terms.** "Waiting for audio", "Transcribing", "Transcript ready to review", "Transcription failed". Never `transcription_processing`.
- **Errors say what happened and what to do.** "The patient track has no speech we could detect. Check you attached the right file, then try again." Never "Something went wrong", never an apology.
- **Empty states invite the next action.** "No consultations yet. Create one to attach audio and get a transcript."
- **Dates and times.** European order and a 24-hour clock: "Tue 13 Oct 2026, 09:30". Durations "0:07" or "1:02:15". Transcript times "0:13.4".
- **Languages by name.** "English", "German", "Slovak", "Mixed or unsure".
- **References.** A patient reference is `SYN-` plus digits; the format itself refuses a name. No banners or reminders that the data is for testing: the people using the app know.

## Visual foundations

**Colour.** Neutrals are London fog: `ground`, `paper`, `paper-sunk`, `rule`, `rule-strong`, `ink`, `ink-muted`. Meaning comes from four hues, each with one job:

| Token | Job |
| --- | --- |
| `practitioner` | Ink navy. The name and its mark; the practitioner's voice; primary buttons, links, the current step |
| `patient` | Bottle green. The patient's voice |
| `lamp-mark`, `lamp-tint`, `lamp-ink` | Lamplight. Check this: uncertain words, steps waiting on you to check |
| `oxblood`, `oxblood-tint` | Oxblood. Failed or destructive: errors, failed steps, danger buttons |

A finished step is `ink` with a check icon. Status is never colour alone: every chip, step and notice carries a word, and most carry an icon. Text on a practitioner or patient fill is `on-practitioner` or `on-patient`, never literal white. Every text pair meets 4.5:1 and every edge, mark and focus ring 3:1, in both themes (`design/check_contrast.py` in the repository checks this).

**Type.** Eczar (`display`) appears only in the `wordmark`, one `title` per screen and the sign-in `thesis`. Everything else is Atkinson Hyperlegible Next (`text`), chosen for legibility: `body` for reading, `transcript` for what was said, `label` for labels and buttons, `heading` for panels, `small` for hints. Times, durations and references use Atkinson Hyperlegible Mono (`mono`) with tabular figures. Nothing is smaller than 14px.

**Space and size.** Spacing steps are `space-1` to `space-16` (4px to 64px). Controls are at least `control-height` (44px) tall. Pages are at most `content-width` wide with a `space-4` gutter; reading text stops at `measure`.

**Shape.** Paper is nearly square (`radius-paper`); controls are slightly softer (`radius-control`); only chips, progress bars and play buttons are round (`radius-pill`).

**Focus and motion.** Keyboard focus is a 3px solid `focus` ring, 2px outside the element, on everything interactive. Motion only shows that work is happening (the transcription bar, a recording pulse, a button's spinner) and stops under `prefers-reduced-motion`.

**Layout.** Header: wordmark left, the signed-in email and "Sign out" right. A consultation page reads top to bottom: back link, reference as the title with date and language, the journey (Consent, Audio, Transcript, Review), then the panel for the current step. Phones get the same order in one column.

## Iconography

Icons are Lucide (the `lucide-react` package in the app), drawn at 20px or 16px with a 1.75 stroke in `currentColor`. An icon always sits beside a word; it never replaces one. No emoji, no illustrations. The one drawn mark is Watson's pen nib, mid-stroke, before the name (`wordmark`); it is also the browser icon.

## Signature: two rails

A transcript reads as one column of turns. Down its left edge run two thin rails, patient then practitioner, like the two audio tracks laid on their side. Each turn lights its speaker's rail; when both people spoke at once, both rails light. If the tracks were not recorded together, both rails are dashed and a notice says the order of turns is a best guess. See the Transcript component.

## Using this system in code

Components are plain CSS classes in `components/bundle.css` (prefix `wa-`), built on the tokens. Markup for each component is in its preview. The web app (`apps/web`) loads the same tokens and stylesheet, so a change here is a change there.
