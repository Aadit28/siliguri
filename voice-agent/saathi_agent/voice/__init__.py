"""Week 2: the audio layer.

Nothing here is imported by `saathi_agent` itself. The text-mode package has
no LiveKit dependency and keeps none - `pip install -e ".[dev]"` still runs
the whole week-1 suite with no `livekit` on the machine.

Most of this package is pure Python and imports fine without the voice extra:

    saathi_agent.voice.config     env wiring, elder tuning constants
    saathi_agent.voice.lock       the readback interruption-lock decision
    saathi_agent.voice.sarvam_ws  the Sarvam WebSocket contract, as functions
    saathi_agent.voice.cache      pre-synthesized fixed frames + warm CLI
    saathi_agent.voice.metrics    per-turn latency records + report CLI

Only `sarvam_stt`, `sarvam_tts` and `worker` need
`pip install -e ".[voice]"`, and they say so with a real error if it is
missing. They are exposed lazily below so that `import saathi_agent.voice`
never drags LiveKit in as a side effect - which is also why the week-3
streaming adapters keep their wire protocol in `sarvam_ws`, where the base
test run can reach it.
"""

from __future__ import annotations

from typing import Any

from .config import (
    MAX_ENDPOINTING_DELAY,
    MIN_ENDPOINTING_DELAY,
    SILENCE_TIMEOUT_S,
    SarvamSettings,
    elder_context_from_metadata,
    sarvam_language,
)
from .lock import PlaybackPolicy, interruption_locked, playback_policy, should_discard_user_turn

#: attribute -> (module, symbol). Resolved on first access, not at import.
#:
#: `cache` and `metrics` are here despite needing no extra: both are also
#: `python -m` entry points, and a module that the package has already
#: imported gets run twice by runpy.
_LAZY: dict[str, tuple[str, str]] = {
    "MetricsRecorder": (".metrics", "MetricsRecorder"),
    "SaathiVoiceAgent": (".worker", "SaathiVoiceAgent"),
    "SarvamSTT": (".sarvam_stt", "SarvamSTT"),
    "SarvamTTS": (".sarvam_tts", "SarvamTTS"),
    "TTSFrameCache": (".cache", "TTSFrameCache"),
    "TurnClock": (".metrics", "TurnClock"),
    "entrypoint": (".worker", "entrypoint"),
    "fixed_frames": (".cache", "fixed_frames"),
}

__all__ = [
    "MAX_ENDPOINTING_DELAY",
    "MIN_ENDPOINTING_DELAY",
    "MetricsRecorder",
    "PlaybackPolicy",
    "SILENCE_TIMEOUT_S",
    "SaathiVoiceAgent",
    "SarvamSTT",
    "SarvamSettings",
    "SarvamTTS",
    "TTSFrameCache",
    "TurnClock",
    "elder_context_from_metadata",
    "entrypoint",
    "fixed_frames",
    "interruption_locked",
    "playback_policy",
    "sarvam_language",
    "should_discard_user_turn",
]


def __getattr__(name: str) -> Any:
    target = _LAZY.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    from importlib import import_module

    module, symbol = target
    return getattr(import_module(module, __name__), symbol)


def __dir__() -> list[str]:
    return sorted(__all__)
