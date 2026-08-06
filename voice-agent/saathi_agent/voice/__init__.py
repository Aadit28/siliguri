"""Week 2: the audio layer.

Nothing here is imported by `saathi_agent` itself. The text-mode package has
no LiveKit dependency and keeps none - `pip install -e ".[dev]"` still runs
the whole week-1 suite with no `livekit` on the machine.

Two of the four modules in this package are pure Python and import fine
without the voice extra:

    saathi_agent.voice.config   env wiring, elder tuning constants
    saathi_agent.voice.lock     the readback interruption-lock decision

The other two (`sarvam_stt`, `sarvam_tts`) and `worker` need
`pip install -e ".[voice]"` and say so with a real error if it is missing.
They are exposed lazily below so that `import saathi_agent.voice` never drags
LiveKit in as a side effect.
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
_LAZY: dict[str, tuple[str, str]] = {
    "SarvamSTT": (".sarvam_stt", "SarvamSTT"),
    "SarvamTTS": (".sarvam_tts", "SarvamTTS"),
    "SaathiVoiceAgent": (".worker", "SaathiVoiceAgent"),
    "entrypoint": (".worker", "entrypoint"),
}

__all__ = [
    "MAX_ENDPOINTING_DELAY",
    "MIN_ENDPOINTING_DELAY",
    "PlaybackPolicy",
    "SILENCE_TIMEOUT_S",
    "SaathiVoiceAgent",
    "SarvamSTT",
    "SarvamSettings",
    "SarvamTTS",
    "elder_context_from_metadata",
    "entrypoint",
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
