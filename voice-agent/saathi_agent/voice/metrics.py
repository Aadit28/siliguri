"""Per-turn latency instrumentation.

The week-3 job is latency, and latency work that is not measured is
decoration. Every turn writes one JSONL line with the timestamps that bracket
the parts we can actually move:

    user_speech_end   the framework says the elder stopped talking
    stt_final         Saaras returned the transcript
    llm_done          the tool loop finished and there is a reply to speak
    tts_first_chunk   the first audio bytes for that reply exist
    playback_start    the room started playing them
    playback_end      the reply finished

`llm_first_token` is deliberately absent. The brain is synchronous and does a
whole tool loop per turn (week-1 deviation note), so there is no first token
to stamp - `llm_done` is the honest name for what is measured, and pretending
otherwise would put a number in the report that no one can act on.

Free of LiveKit: `TurnClock` takes stamps from whoever has them, and the
worker is the only thing that knows what a LiveKit event means.

    python -m saathi_agent.voice.metrics report            # all calls
    python -m saathi_agent.voice.metrics report .metrics/lk_room.jsonl
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable, Sequence

from .config import DEFAULT_METRICS_DIR, utf8_console

logger = logging.getLogger("saathi.voice.metrics")

#: Stamp names, in the order a turn passes through them.
STAGES: tuple[str, ...] = (
    "user_speech_end",
    "stt_final",
    "llm_done",
    "tts_first_chunk",
    "playback_start",
    "playback_end",
)

#: The spans worth reporting: (name, from_stage, to_stage). `response` is the
#: one the elder actually experiences - silence between them finishing and the
#: agent starting - so it leads the report.
SPANS: tuple[tuple[str, str, str], ...] = (
    ("response", "user_speech_end", "playback_start"),
    ("stt", "user_speech_end", "stt_final"),
    ("think", "stt_final", "llm_done"),
    ("tts_first_chunk", "llm_done", "tts_first_chunk"),
    ("playback_lead_in", "tts_first_chunk", "playback_start"),
)


def metrics_dir() -> Path:
    return Path(os.environ.get("SAATHI_METRICS_DIR") or DEFAULT_METRICS_DIR)


# --------------------------------------------------------------------------
# One turn
# --------------------------------------------------------------------------


@dataclass
class TurnClock:
    """Monotonic stamps for one turn.

    First stamp wins for every stage: a turn can be re-entered (a barge-in, a
    retried synthesis) and the first time the elder stopped talking is still
    the moment the clock they are experiencing started.
    """

    session_id: str
    turn: int
    cache_hit: bool = False
    streaming: bool = True
    stamps: dict[str, float] = field(default_factory=dict)
    started_at: float = field(default_factory=time.time)

    def stamp(self, stage: str, *, at: float | None = None) -> None:
        if stage not in STAGES:
            raise KeyError(f"unknown latency stage {stage!r}; known: {STAGES}")
        self.stamps.setdefault(stage, time.monotonic() if at is None else at)

    def elapsed(self, name: str) -> float | None:
        for span, start, end in SPANS:
            if span == name:
                first, last = self.stamps.get(start), self.stamps.get(end)
                return None if first is None or last is None else last - first
        raise KeyError(f"unknown span {name!r}")

    def record(self) -> dict[str, object]:
        """The JSONL line. Spans are pre-computed so the report does no maths
        on wall-clock values it did not take itself."""
        spans = {name: self.elapsed(name) for name, _, _ in SPANS}
        return {
            "session_id": self.session_id,
            "turn": self.turn,
            "started_at": self.started_at,
            "cache_hit": self.cache_hit,
            "streaming": self.streaming,
            "stamps": dict(self.stamps),
            "spans": {name: value for name, value in spans.items() if value is not None},
        }


class MetricsRecorder:
    """Append-only JSONL, one file per call.

    Never raises at the caller: a disk that is full must not end a call that
    is otherwise working.
    """

    def __init__(self, session_id: str, *, directory: Path | str | None = None) -> None:
        self.session_id = session_id
        self.directory = Path(directory) if directory is not None else metrics_dir()
        self.path = self.directory / f"{_safe_name(session_id)}.jsonl"

    def write(self, clock: TurnClock) -> bool:
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(clock.record(), ensure_ascii=False) + "\n")
        except OSError:
            logger.exception("could not write the latency record for %s", self.session_id)
            return False
        return True


def _safe_name(session_id: str) -> str:
    return "".join(char if char.isalnum() or char in "-_." else "_" for char in session_id)


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------


def percentile(values: Sequence[float], q: float) -> float:
    """Linear-interpolated percentile, `q` in 0..100 (numpy's default method).

    Spelled out rather than imported: numpy is not a dependency of this
    package and one function does not justify making it one.
    """
    if not values:
        raise ValueError("percentile of an empty sample")
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    position = (len(ordered) - 1) * (q / 100.0)
    low, high = math.floor(position), math.ceil(position)
    if low == high:
        return float(ordered[int(position)])
    return float(ordered[low] + (position - low) * (ordered[high] - ordered[low]))


@dataclass(frozen=True)
class SpanSummary:
    span: str
    count: int
    p50: float
    p95: float
    mean: float
    worst: float


def summarize(records: Iterable[dict[str, object]]) -> dict[str, object]:
    """p50/p95 per span, plus how much of the traffic the cache absorbed."""
    samples: dict[str, list[float]] = {name: [] for name, _, _ in SPANS}
    turns = 0
    cache_hits = 0
    streamed = 0

    for record in records:
        turns += 1
        cache_hits += bool(record.get("cache_hit"))
        streamed += bool(record.get("streaming"))
        spans = record.get("spans")
        if not isinstance(spans, dict):
            continue
        for name, value in spans.items():
            if name in samples and isinstance(value, (int, float)):
                samples[name].append(float(value))

    summaries = [
        SpanSummary(
            span=name,
            count=len(values),
            p50=percentile(values, 50),
            p95=percentile(values, 95),
            mean=sum(values) / len(values),
            worst=max(values),
        )
        for name, values in samples.items()
        if values
    ]
    return {
        "turns": turns,
        "cache_hits": cache_hits,
        "streamed": streamed,
        "spans": [asdict(summary) for summary in summaries],
    }


def read_records(target: Path) -> list[dict[str, object]]:
    """Every record under a file or a directory. Bad lines are skipped, not fatal."""
    files = sorted(target.glob("*.jsonl")) if target.is_dir() else [target]
    records: list[dict[str, object]] = []
    for path in files:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                logger.warning("skipping a malformed record in %s", path)
                continue
            if isinstance(parsed, dict):
                records.append(parsed)
    return records


def format_report(summary: dict[str, object]) -> str:
    turns = summary["turns"]
    if not turns:
        return "no turns recorded"
    spans = summary["spans"]
    assert isinstance(spans, list)

    width = max((len(str(row["span"])) for row in spans), default=4)
    lines = [
        f"turns={turns}  cache_hits={summary['cache_hits']}  streamed={summary['streamed']}",
        f"{'span'.ljust(width)}  {'n':>4}  {'p50':>8}  {'p95':>8}  {'mean':>8}  {'worst':>8}",
    ]
    order = {name: index for index, (name, _, _) in enumerate(SPANS)}
    for row in sorted(spans, key=lambda item: order.get(str(item["span"]), 99)):
        lines.append(
            f"{str(row['span']).ljust(width)}  {row['count']:>4}  "
            f"{row['p50'] * 1000:>7.0f}ms  {row['p95'] * 1000:>7.0f}ms  "
            f"{row['mean'] * 1000:>7.0f}ms  {row['worst'] * 1000:>7.0f}ms"
        )
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    utf8_console()
    logging.basicConfig(level=os.environ.get("SAATHI_LOG_LEVEL", "WARNING"), format="%(message)s")
    parser = argparse.ArgumentParser(
        prog="python -m saathi_agent.voice.metrics",
        description="Per-turn voice latency (BUILD_GUIDE D.5).",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    report = sub.add_parser("report", help="p50/p95 per span")
    report.add_argument(
        "target",
        nargs="?",
        default=None,
        help="a .jsonl file or a directory of them (default: $SAATHI_METRICS_DIR)",
    )
    report.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv)

    target = Path(args.target) if args.target else metrics_dir()
    if not target.exists():
        print(f"no metrics at {target}", file=sys.stderr)
        return 1

    summary = summarize(read_records(target))
    print(json.dumps(summary, indent=2) if args.json else format_report(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
