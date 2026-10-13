"use strict";
const $ = (id) => document.getElementById(id);
let recorded = null; // {blob, format}
let recorder = null;

const FORMATS = ["wav", "mp3", "m4a", "mp4", "flac", "ogg", "webm"];
const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

fetch("/health").then((r) => r.json()).then((h) => {
  $("retention").textContent = h.deployment === "cloud-demo"
    ? "This hosted demo deletes audio and transcript from the server as soon as it replies."
    : "Running on this computer; files stay in the local data folder.";
}).catch(() => {});

$("record").addEventListener("click", async () => {
  if (recorder) { recorder.stop(); return; }
  $("error").textContent = "";
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    $("error").textContent = "Microphone access was refused or is unavailable.";
    return;
  }
  const chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.addEventListener("dataavailable", (e) => chunks.push(e.data));
  recorder.addEventListener("stop", () => {
    stream.getTracks().forEach((t) => t.stop());
    const type = recorder.mimeType;
    const format = FORMATS.find((f) => type.includes(f)) || "webm";
    recorded = { blob: new Blob(chunks, { type }), format };
    recorder = null;
    $("file").value = "";
    $("record").textContent = "Record again";
    $("recording").textContent = "Recording ready.";
    $("preview").src = URL.createObjectURL(recorded.blob);
    $("preview").hidden = false;
  });
  recorder.start();
  $("record").textContent = "Stop recording";
  $("recording").textContent = "Recording…";
});

$("file").addEventListener("change", () => {
  recorded = null;
  $("preview").hidden = true;
  $("recording").textContent = "";
});

$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("error").textContent = "";
  $("result").hidden = true;
  const file = $("file").files[0];
  let body, format;
  if (file) {
    body = file;
    format = file.name.split(".").pop().toLowerCase();
  } else if (recorded) {
    ({ blob: body, format } = recorded);
  } else {
    $("error").textContent = "Choose a file or make a recording first.";
    return;
  }
  const query = new URLSearchParams({ speaker: $("speaker").value, format });
  if ($("language").value) query.set("language", $("language").value);

  $("submit").disabled = true;
  const started = Date.now();
  const tick = setInterval(() => {
    $("status").textContent = `Transcribing… ${Math.round((Date.now() - started) / 1000)} s`;
  }, 1000);
  $("status").textContent = "Uploading…";
  try {
    const response = await fetch(`/appointments/${crypto.randomUUID()}/transcriptions?${query}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${$("token").value}` },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.message
        || (response.status === 401 ? "The access token is wrong." : `Request failed (${response.status}).`);
      throw new Error(payload.error_category ? `${message} [${payload.error_category}]` : message);
    }
    render(payload, (Date.now() - started) / 1000);
  } catch (error) {
    $("status").textContent = "";
    $("error").textContent = error instanceof TypeError
      ? "The server could not be reached. Nothing was transcribed." : error.message;
  } finally {
    clearInterval(tick);
    $("submit").disabled = false;
  }
});

function render(transcript, seconds) {
  const model = transcript.transcription_model;
  $("status").textContent = `Done in ${seconds.toFixed(1)} s.`;
  $("meta").textContent = `Language: ${transcript.source_languages.join(", ")} · Model: ${model.provider} ${model.model} (${model.device}, ${model.compute_type}) · Segments: ${transcript.segments.length}`;
  const rows = transcript.segments.map((segment) => {
    const row = document.createElement("tr");
    const cells = [
      `${clock(segment.start_seconds)} – ${clock(segment.end_seconds)}`,
      segment.speaker,
      segment.machine_text,
      segment.confidence === null ? "not available" : `${Math.round(segment.confidence * 100)}%`,
    ];
    for (const text of cells) row.appendChild(document.createElement("td")).textContent = text;
    return row;
  });
  $("segments").replaceChildren(...rows);
  $("empty").hidden = rows.length > 0;
  $("download").href = URL.createObjectURL(
    new Blob([JSON.stringify(transcript, null, 2)], { type: "application/json" }));
  $("result").hidden = false;
}
