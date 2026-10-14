# AudioSlot

One speaker's audio track: empty, recording, uploading or attached. A consultation shows two slots side by side, practitioner then patient; they stack on phones.

- **Empty:** a drop zone that says what to drop, "Choose file" and "Record with microphone", and the formats and size limit.
- **Recording:** elapsed time, a level meter so the practitioner sees the microphone hears them, and "Stop".
- **Uploading:** a progress bar with percent and size, and "Cancel".
- **Attached:** a player to check it is the right file, then length, format and size, with "Replace" and "Remove". The SHA-256 sits under "Details".
- A refused file shows `wa-error` inside the slot with the reason: "This file is 63 MB. The limit is 50 MB."
- `wa-slot--patient` switches the slot to the patient's colours; the practitioner is the default.

The consumer provides: the speaker, the state, and for an attached track its length, format, size and hash.
