import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from clinical_worker.__main__ import SCHEMA_DIR, schema_json
from clinical_worker.config import load_settings
from clinical_worker.log import log_event
from clinical_worker.merge import merge
from clinical_worker.schema import (
    SCHEMA_VERSION,
    Segment,
    Speaker,
    Track,
    Transcript,
    TranscriptionModel,
)
from clinical_worker.transcribe import RawSegment


def raw(start: float, end: float, text: str = "words") -> RawSegment:
    return RawSegment(start=start, end=end, text=text, confidence=0.9, possibly_not_speech=False)


class TestMerge:
    def test_orders_by_time_across_speakers(self) -> None:
        segments = merge(
            {"practitioner": [raw(0, 2, "a"), raw(6, 8, "c")], "patient": [raw(3, 5, "b")]},
            {},
            recorded_together=False,
            tolerance_seconds=0.25,
        )
        assert [s.machine_text for s in segments] == ["a", "b", "c"]
        assert [s.position for s in segments] == [0, 1, 2]
        assert [s.speaker for s in segments] == ["practitioner", "patient", "practitioner"]

    def test_breaks_ties_practitioner_first_then_track_order(self) -> None:
        segments = merge(
            {"patient": [raw(1, 2, "p1"), raw(1, 2, "p2")], "practitioner": [raw(1, 2, "d1")]},
            {},
            recorded_together=False,
            tolerance_seconds=0.25,
        )
        assert [s.machine_text for s in segments] == ["d1", "p1", "p2"]

    def test_applies_each_track_offset(self) -> None:
        segments = merge(
            {"practitioner": [raw(0, 1, "a")], "patient": [raw(0, 1, "b")]},
            {"patient": 5.0},
            recorded_together=True,
            tolerance_seconds=0.25,
        )
        assert [(s.machine_text, s.start_seconds) for s in segments] == [("a", 0.0), ("b", 5.0)]

    def test_marks_overlap_only_when_the_tracks_share_a_clock(self) -> None:
        tracks: dict[Speaker, list[RawSegment]] = {
            "practitioner": [raw(0, 3, "a")],
            "patient": [raw(2, 4, "b")],
        }
        together = merge(tracks, {}, recorded_together=True, tolerance_seconds=0.25)
        assert [s.overlap for s in together] == [True, True]
        apart = merge(tracks, {}, recorded_together=False, tolerance_seconds=0.25)
        assert [s.overlap for s in apart] == [None, None]

    def test_ignores_overlap_within_the_tolerance_and_within_one_speaker(self) -> None:
        brief = merge(
            {"practitioner": [raw(0, 2.1)], "patient": [raw(2.0, 4)]},
            {},
            recorded_together=True,
            tolerance_seconds=0.25,
        )
        assert [s.overlap for s in brief] == [False, False]
        same = merge(
            {"practitioner": [raw(0, 3), raw(1, 4)], "patient": []},
            {},
            recorded_together=True,
            tolerance_seconds=0.25,
        )
        assert [s.overlap for s in same] == [False, False]


def transcript(**overrides: object) -> dict[str, object]:
    model = TranscriptionModel(model="tiny", device="cpu", compute_type="int8")
    tracks = [
        Track(
            speaker=speaker,
            audio_sha256="a" * 64,
            duration_seconds=7.5,
            sync_method="none",
            language="en",
            transcription_model=model,
        )
        for speaker in ("practitioner", "patient")
    ]
    segment = Segment(
        segment_id=uuid4(),
        position=0,
        speaker="patient",
        start_seconds=0,
        end_seconds=1,
        machine_text="x",
    )
    return {
        "consultation_id": uuid4(),
        "created_at_utc": datetime.now(UTC),
        "ordering": "approximate",
        "low_confidence_threshold": 0.5,
        "tracks": tracks,
        "segments": [segment],
        **overrides,
    }


class TestTranscriptSchema:
    def test_accepts_a_consistent_transcript(self) -> None:
        assert Transcript.model_validate(transcript()).schema_version == "2.0.0"

    @pytest.mark.parametrize(
        "overrides",
        [
            {"tracks": []},
            {
                "segments": [
                    Segment(
                        segment_id=uuid4(),
                        position=3,
                        speaker="patient",
                        start_seconds=0,
                        end_seconds=1,
                        machine_text="x",
                    )
                ]
            },
            {
                "segments": [
                    Segment(
                        segment_id=uuid4(),
                        position=0,
                        speaker="patient",
                        start_seconds=0,
                        end_seconds=1,
                        machine_text="x",
                        overlap=True,
                    )
                ]
            },
            {"diagnosis": "anything"},
        ],
    )
    def test_refuses_an_inconsistent_transcript(self, overrides: dict[str, object]) -> None:
        with pytest.raises(ValidationError):
            Transcript.model_validate(transcript(**overrides))

    def test_refuses_a_segment_that_ends_before_it_starts(self) -> None:
        with pytest.raises(ValidationError):
            Segment(
                segment_id=uuid4(),
                position=0,
                speaker="patient",
                start_seconds=2,
                end_seconds=1,
                machine_text="x",
            )

    def test_committed_json_schema_is_current(self) -> None:
        committed = (SCHEMA_DIR / f"transcript-{SCHEMA_VERSION}.schema.json").read_text()
        assert committed == schema_json(), "run: uv run clinical-worker export-schema"


class TestSettings:
    def test_environment_wins_over_the_file(self, tmp_path) -> None:  # type: ignore[no-untyped-def]
        file = tmp_path / "engine.env"
        file.write_text("WATSON_MODEL=medium\nWATSON_ENGINE_EMAIL=engine@example.test\n")
        settings = load_settings({"WATSON_ENV_FILE": str(file), "WATSON_MODEL": "tiny"})
        assert (settings.model, settings.engine_email) == ("tiny", "engine@example.test")

    def test_password_never_appears_in_its_representation(self) -> None:
        settings = load_settings(
            {"WATSON_ENV_FILE": "/nonexistent", "WATSON_ENGINE_PASSWORD": "s3cret-value"}
        )
        assert "s3cret-value" not in repr(settings)


def test_log_event_refuses_fields_outside_the_allow_list() -> None:
    with pytest.raises(ValueError, match="machine_text"):
        log_event("x", machine_text="anything")


def test_form_answers_keep_only_real_lines_and_say_nothing_for_topics_not_discussed() -> None:
    from clinical_worker.form import Line, Template, parse

    template = Template.model_validate(
        {
            "title": "T",
            "sections": [
                {
                    "title": "S",
                    "fields": [
                        {"key": "sleep", "label": "Sleep"},
                        {"key": "diet", "label": "Diet"},
                        {"key": "work", "label": "Work"},
                    ],
                }
            ],
        }
    )
    lines = [Line(0, "patient", "I sleep badly."), Line(1, "practitioner", "Since when?")]
    raw = json.dumps(
        {
            "sleep": {"lines": [0, 0, 7, "1"], "answer": "  Sleeps badly.  "},
            "diet": {"lines": [1], "answer": "None specified."},
            "extra": {"lines": [0], "answer": "not asked for"},
        }
    )
    answers = {a.key: a for a in parse(raw, template, lines)}
    assert answers["sleep"].text == "Sleeps badly." and answers["sleep"].evidence == [0]
    assert answers["diet"].text is None and answers["diet"].evidence == []
    assert answers["work"].text is None  # missing from the output
    assert set(answers) == {"sleep", "diet", "work"}
