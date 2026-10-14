# Button

Starts an action. One `primary` button per screen marks the next step; every other action is `secondary`, `quiet` or `danger`.

- **primary**: the screen's next step ("Create consultation", "Start transcription").
- **secondary**: alternatives and cancels ("Cancel", "Choose file").
- **quiet**: light actions inside a panel ("Show details", "Replace").
- **danger**: removes or destroys something ("Remove patient audio", "Withdraw consent"). Ask for confirmation inline, in the same place, before acting.
- `eh-button--small` only in dense rows on wide screens; it is below the 44px touch target.
- While the action runs, set `aria-busy="true"` and switch the words to the ongoing form ("Creating…"). When a button cannot be used yet, disable it and say why next to it ("Attach the patient track first.").

The consumer provides: a `<button>` (or an `<a>` for navigation) with `eh-button` and one modifier, a verb-first label, and optionally a 20px Lucide icon before the label.
