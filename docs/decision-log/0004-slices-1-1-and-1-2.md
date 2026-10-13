# 0004 — Choices made in slices 1.1 and 1.2

Status: accepted 13 October 2026. Each is the smallest reversible choice where the
specification left a detail open.

| # | Context | Decision | Alternative considered | Consequence | Reversal path |
|---|---|---|---|---|---|
| 1 | "Mixed or unsure" needs a stored value. | The language value `auto`. | A separate flag. | One field to read. | Rename the enum value in a migration. |
| 2 | "Synthetic reference" had no format. | `SYN-` followed by one to eight digits, checked in the form, the function and the table. | Free text with a warning. | Real names cannot be typed into that field. | Change the pattern in a migration. |
| 3 | Scenario notes are free text and cannot be checked. | At most 500 characters, with a reminder on screen. | No notes field. | A real detail could still be typed. It never reaches the audit log. | Remove the field. |
| 4 | Hosted sign-in settings are not part of the database migrations. | `scripts/configure-hosted-auth.sh` applies them through Supabase's management API. | Pushing the whole local configuration file, which would also overwrite hosted addresses with local ones. | Two commands configure a new project: `supabase db push` and this script. | Run the script with other values. |
| 5 | Render syncs a blueprint on push only when its GitHub app is installed, and it is not. | The static site was created once with the Render command-line tool; `scripts/deploy-web.sh` triggers each deploy. | Keeping `render.yaml`. | A deploy is a manual step after pushing. | Install the GitHub app and switch on automatic deploys. |
| 6 | A static page cannot receive a per-request script nonce, and the framework emits inline scripts. | A build step writes a content security policy into each page, listing the hashes of exactly its own inline scripts. | Allowing all inline scripts. | Injected scripts are refused by the browser. The policy is rebuilt on every build. | Delete `apps/web/scripts/inject-csp.mjs` and set a looser policy on the host. |
| 7 | Replacing a stored file needs an extra storage permission, and the local storage service mishandled it before its version matched the hosted one. | The app deletes any earlier file, then uploads. No update permission exists. | Upload with replace. | Stored audio cannot be overwritten, only deleted and added. | Add an update rule. |
| 8 | After `supabase link`, the local stack must run the same service versions as the hosted project. | Restart the local stack after linking. | Leaving the versions the tool started with. | Local tests exercise the hosted versions. | None needed. |
| 9 | Checks against the live app must not run inside the owner's account. | A separate hosted account, `checks@eheal.test`, is used by the browser tests. | Signing in as the owner. | The owner's consultations are never opened by a test or by the AI builder. | Delete the account. |
| 10 | Whether both tracks line up in time cannot be known from two uploaded files. | A tick box, stored on the consultation as `recorded_together`. | Per-track capture times, which uploaded files do not have. | Without the tick the order of turns is labelled a best guess. | Add capture times in phase 3. |
