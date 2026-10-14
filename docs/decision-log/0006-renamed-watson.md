# 0006 — The product is renamed Watson

Status: accepted 14 October 2026, by the owner. The owner found that "eHeal" did not feel
right and asked for a name with a story people remember once they hear it, carried by
everything: the repository, the web address, the screens and the colours.

| # | Decision | Consequence |
|---|---|---|
| 1 | The product is called Watson. Sherlock Holmes solved the cases; Dr John Watson, a doctor, sat in on every one, listened, wrote everything down and kept the record. The practitioner is Sherlock; the app is their Watson. Line: "Every doctor deserves a Watson." | Rejected on the way: Linden (a quiet story that does not stick), 221B (the owner's colleagues know Sherlock Holmes, not his address), Holmes (in health tech it means Elizabeth Holmes and Theranos), Sherlock (crowded, and it makes the practitioner the sidekick), 42 (a coding school across Europe owns it), Teal, Sage and Jade (existing health or software brands). |
| 2 | Watson suggests; the practitioner decides, as in the stories. | Fits decision 0005: the AI's suggested diagnosis is labelled as a suggestion and never accepted on the practitioner's behalf. |
| 3 | The colours are Baker Street at night: ink navy for the name and the practitioner's voice, bottle green for the patient's voice, lamplight for what needs checking, London fog for the neutrals, oxblood for failure. The mark is a pen nib, mid-stroke. | Token roles are unchanged; values changed, `turmeric-*` became `lamp-*` and `madder-*` became `oxblood-*`. All 62 contrast pairs pass in both themes. Faces, scale, spacing and components are unchanged. |
| 4 | Everything that carried the old name carries the new one: the repository `ToxicMinds/watson`, the address `watson-app.onrender.com`, settings `WATSON_*`, the folders `~/.config/watson` and `~/.local/share/watson`, the engine service `watson-engine`, the local Supabase project, the CSS class prefix `wa-`, and the test accounts `@watson.test`. | GitHub forwards the old repository name. The old address forwards every path to the new one until the owner agrees to delete it. |
| 5 | IBM used "Watson" for its AI (Watson Health, sold in 2022 and now Merative; watsonx today). | Before real patients (Gate R), a trademark search at EUIPO checks the name. If it is blocked, "Dear Watson" keeps the story. |
