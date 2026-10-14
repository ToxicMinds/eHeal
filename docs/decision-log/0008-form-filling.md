# 0008 — How Watson fills in the doctor's form

Status: accepted 14 October 2026 with the screens the owner approved ("Build them as shown").
Follows decision 0005, items 5 and 6.

| # | Decision | Consequence |
|---|---|---|
| 1 | The form is filled in automatically when a transcript is ready; the practitioner presses nothing. | A database trigger queues a form job if the practitioner has a template; "Try again" on failure. |
| 2 | The model runs on the owner's laptop, inside the engine: Qwen3.5-4B (GGUF, 2.7 GB) through llama.cpp. | Free and private. Chosen over Gemma 4 E4B (one field better, twice the size) and Qwen3-4B (2025). About 2 to 5 minutes per consultation on the laptop's processor. |
| 3 | The model sees the transcript as numbered lines and, per field, names the lines first, then writes the answer, held to a JSON schema. | Every answer shows its quote; lines that do not exist are dropped; "none specified" style answers count as not discussed. |
| 4 | Each answer is accepted, edited or rejected by the practitioner; the form is approved only when every answer the model gave has a decision. | Suggestions (diagnosis, dosha) are tagged as suggestions and never accepted on the practitioner's behalf. |
| 5 | One template per practitioner. Dr. Robin's form is the owner's template; it lives outside the public repository. | Name, surname, address, signature and date are left out of the template: they identify a person or are the practitioner's own. |
| 6 | The builder tests on invented consultations only (spec 5.1); the owner tests their own calls in the app. | Fixtures in English and Slovak with expected answers; `bench/form_bench.py`. Measured: English 18 of 21 fields, Slovak 21 of 21. Text-to-speech and written fixtures are cleaner than real calls. |
