# Field

A labelled input with an optional hint and error: label on top, hint under the label, error under the input.

- Inputs are `wa-input`, `wa-textarea`, and `wa-select` wrapped around a native `<select>`. Dates and times use the native `datetime-local` input with `wa-input`.
- A fixed prefix, such as the `SYN-` of a reference, goes in an `wa-affix` inside `wa-affixed`, so the practitioner types digits only.
- On error, set `aria-invalid="true"` on the input and show `wa-error` with an icon and a sentence that says how to fix it. Connect the hint and the error to the input with `aria-describedby`.
- Two short fields go side by side in `wa-fields-row`; they stack on phones.

The consumer provides: a `<label for>` with `wa-label`, the input with a stable `id`, and the hint and error text.
