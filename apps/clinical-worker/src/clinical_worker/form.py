"""Fills a practitioner's form from a transcript with a local model (decision 0005).

The model sees the transcript as numbered lines and, for every field, first names the lines
its answer rests on, then writes the answer. Nothing leaves the computer."""

import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

Mode = Literal["extract", "suggest"]
# Small models sometimes answer "none specified" instead of leaving a field empty.
# A bare "None" stays: the patient may have said so ("no operations").
EMPTY = re.compile(
    r"^((none|nothing|not) (specified|mentioned|discussed|stated|given)|n/?a|-"
    r"|neuveden[éa]|nešpecifikovan[éa]|nie je uveden[éa]"
    r"|nicht (erwähnt|angegeben)|keine angabe)\W*$",
    re.IGNORECASE,
)
LANGUAGE_NAMES = {"en": "English", "de": "German", "sk": "Slovak"}


class TemplateField(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    label: str = Field(min_length=1, max_length=120)
    mode: Mode = "extract"
    hint: str = Field(default="", max_length=300)


class TemplateSection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)
    fields: list[TemplateField] = Field(min_length=1)


class Template(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)
    sections: list[TemplateSection] = Field(min_length=1)

    @property
    def fields(self) -> list[TemplateField]:
        return [f for s in self.sections for f in s.fields]


@dataclass(frozen=True)
class Line:
    position: int
    speaker: Literal["practitioner", "patient"]
    text: str


@dataclass(frozen=True)
class Answer:
    key: str
    text: str | None  # None: not discussed
    evidence: list[int]  # transcript positions the answer rests on


class Model(Protocol):
    def complete(
        self, system: str, user: str, schema: dict[str, Any], stop: Callable[[], bool]
    ) -> str: ...


SYSTEM = """You fill in a practitioner's consultation form from the transcript of a consultation \
between a practitioner and a patient.

Rules:
- Use only what was said in the transcript. Never add facts, advice or diagnoses that nobody said.
- For every field, first list the numbers of the transcript lines the answer comes from, then \
write the answer.
- If nothing was said about a field's topic, give no lines and the answer null. Never write \
"none", "not mentioned" or "not specified".
- Put each fact or piece of advice in the one field it fits best; do not repeat it elsewhere.
- Fields about advice or recommendations hold only what the practitioner advised, not what \
the patient said.
- Write short notes, as a practitioner would, in {language}. Keep numbers, doses and the names \
of remedies exactly as they were said.
- Report the patient's own situation. A relative's illness is not the patient's condition.
- Fields marked SUGGEST ask for an assessment: give the practitioner's assessment if they said \
one, otherwise your suggestion from what the patient described, and cite the lines it rests on."""


def numbered(lines: list[Line]) -> str:
    return "\n".join(
        f"[{line.position}] {line.speaker.capitalize()}: {line.text.strip()}" for line in lines
    )


def prompt(template: Template, lines: list[Line], language: str) -> tuple[str, str]:
    fields = "\n".join(
        f"{section.title}:\n"
        + "\n".join(
            f"- {f.key}: {f.label}{'. ' + f.hint if f.hint else ''}"
            + (" [SUGGEST]" if f.mode == "suggest" else "")
            for f in section.fields
        )
        for section in template.sections
    )
    system = SYSTEM.format(language=LANGUAGE_NAMES.get(language, "the language of the transcript"))
    user = f"Form fields:\n{fields}\n\nTranscript:\n{numbered(lines)}"
    return system, user


def schema(template: Template) -> dict[str, Any]:
    entry = {
        "type": "object",
        "properties": {
            "lines": {"type": "array", "items": {"type": "integer"}, "maxItems": 12},
            "answer": {"type": ["string", "null"]},
        },
        "required": ["lines", "answer"],
        "additionalProperties": False,
    }
    keys = [f.key for f in template.fields]
    return {
        "type": "object",
        "properties": dict.fromkeys(keys, entry),
        "required": keys,
        "additionalProperties": False,
    }


def parse(raw: str, template: Template, lines: list[Line]) -> list[Answer]:
    """Keeps only what the form asked for. Line numbers that do not exist are dropped."""
    data = json.loads(raw)
    known = {line.position for line in lines}
    answers = []
    for f in template.fields:
        item = data.get(f.key) if isinstance(data, dict) else None
        item = item if isinstance(item, dict) else {}
        text = item.get("answer")
        text = text.strip()[:2000] if isinstance(text, str) and text.strip() else None
        text = None if text and EMPTY.match(text) else text
        cited = item.get("lines")
        cited = cited if isinstance(cited, list) else []
        evidence = sorted({n for n in cited if isinstance(n, int) and n in known})
        answers.append(Answer(f.key, text, evidence if text else []))
    return answers


def fill(
    model: Model,
    template: Template,
    lines: list[Line],
    language: str,
    stop: Callable[[], bool] = lambda: False,
) -> list[Answer]:
    system, user = prompt(template, lines, language)
    return parse(model.complete(system, user, schema(template), stop), template, lines)


class Cancelled(Exception):
    """The caller asked to stop while the model was still writing."""


class LlamaModel:
    """A GGUF model run in this process by llama.cpp, with output held to the JSON schema."""

    def __init__(self, path: Path, context: int = 16384, threads: int = 0) -> None:
        from llama_cpp import Llama

        self.path = path
        self.llm = Llama(
            model_path=str(path),
            n_ctx=context,
            n_threads=threads or None,
            verbose=False,
        )

    def complete(
        self, system: str, user: str, schema: dict[str, Any], stop: Callable[[], bool]
    ) -> str:
        started = time.monotonic()
        chunks: list[str] = []
        self.last_usage: dict[str, int] = {
            "prompt_tokens": len(self.llm.tokenize((system + user).encode()))
        }
        stream: Any = self.llm.create_chat_completion(
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object", "schema": schema},
            temperature=0.1,
            max_tokens=3000,
            stream=True,
        )
        for chunk in stream:  # one token at a time, so a cancelled job stops within a second
            if stop():
                raise Cancelled
            chunks.append(chunk["choices"][0]["delta"].get("content") or "")
        self.last_usage["completion_tokens"] = len(chunks)
        self.last_seconds = round(time.monotonic() - started, 2)
        return "".join(chunks)
