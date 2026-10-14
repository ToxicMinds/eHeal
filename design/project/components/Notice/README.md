# Notice

A short message that changes what the practitioner knows or does: neutral, `attention` or `failed`.

- The title says what is true now ("No transcription engine is running"). The body says what it means and what to do. Add an action button when there is one.
- `attention` for something to check or wait on, `failed` for something that went wrong, neutral for facts that change how to read the screen ("The order of turns is a best guess").
- At most two on a screen. Never a notice for success: the screen moving on is the confirmation.

The consumer provides: an icon, a title, one or two sentences, and optional actions. A failure uses `role="alert"`; the others use `role="status"`.
