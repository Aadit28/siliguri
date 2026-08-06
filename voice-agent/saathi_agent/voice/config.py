"""Voice-layer settings: env wiring, elder tuning numbers, job metadata.

Deliberately free of LiveKit and Sarvam imports. The tuning constants and the
metadata contract are the parts most likely to be got wrong, so they live
where the base test run can still reach them.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

from ..prompts import ElderContext, FamilyMember

# --------------------------------------------------------------------------
# Elder tuning (BUILD_GUIDE D.4). These are not defaults anyone should trust
# blind - D.4 says tune VAD on real pilot audio, not lab clips. They are the
# starting point the guide names.
# --------------------------------------------------------------------------

#: Silence before the turn is considered over. The framework default is ~0.5s;
#: an elder recalling a doctor's name needs the extra 200ms not to be cut off.
MIN_ENDPOINTING_DELAY = 0.7

#: Hard ceiling on that wait, so a long "ummm..." still gets an answer.
MAX_ENDPOINTING_DELAY = 6.0

#: One gentle re-prompt at this point (D.4: 8-10s), close on the second.
SILENCE_TIMEOUT_S = 9.0

#: Background TV and cross-talk are the documented false-barge-in source, so a
#: interruption has to be both long enough and wordy enough to count.
MIN_INTERRUPTION_DURATION = 0.7
MIN_INTERRUPTION_WORDS = 2

#: Never true. Discarding the audio captured during an uninterruptible
#: utterance destroys it before Saaras ever sees it, so no transcript exists -
#: and the distress carve-out in lock.py, which is the whole reason an elder
#: can report chest pain over a readback, works on transcripts. Rule 1 (the
#: readback cannot be cut off) is enforced by `allow_interruptions=False` on
#: the say() handle; rule 2 (nothing said over it counts as consent) is
#: enforced on the text by `ReadbackGate`.
DISCARD_AUDIO_IF_UNINTERRUPTIBLE = False

# --------------------------------------------------------------------------
# Sarvam
# --------------------------------------------------------------------------

DEFAULT_SAARAS_MODEL = "saaras:v3"
DEFAULT_BULBUL_MODEL = "bulbul:v3"
DEFAULT_BULBUL_VOICE = "anushka"

#: "unknown" asks Saaras to detect the language per utterance, which is the
#: only setting that survives a sentence starting in Bengali and finishing in
#: English - the exact input D.1 picked Sarvam for.
DEFAULT_STT_LANGUAGE = "unknown"

DEFAULT_TTS_SAMPLE_RATE = 22050

#: Slightly under natural pace. Telephony (8kHz) tuning is a week-3 job.
DEFAULT_TTS_PACE = 0.9

LANGUAGE_TO_SARVAM: dict[str, str] = {"bn": "bn-IN", "hi": "hi-IN", "en": "en-IN"}


def sarvam_language(language: str) -> str:
    """ElderContext language code -> Sarvam BCP-47-ish code."""
    return LANGUAGE_TO_SARVAM.get(language, LANGUAGE_TO_SARVAM["en"])


def _float_env(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class SarvamSettings:
    """One read of the environment, shared by the STT and TTS adapters."""

    api_key: str = ""
    stt_model: str = DEFAULT_SAARAS_MODEL
    stt_language: str = DEFAULT_STT_LANGUAGE
    tts_model: str = DEFAULT_BULBUL_MODEL
    tts_voice: str = DEFAULT_BULBUL_VOICE
    tts_sample_rate: int = DEFAULT_TTS_SAMPLE_RATE
    tts_pace: float = DEFAULT_TTS_PACE

    @classmethod
    def from_env(cls) -> SarvamSettings:
        return cls(
            api_key=os.environ.get("SARVAM_API_KEY", ""),
            stt_model=os.environ.get("SAARAS_MODEL", DEFAULT_SAARAS_MODEL),
            stt_language=os.environ.get("SARVAM_STT_LANGUAGE", DEFAULT_STT_LANGUAGE),
            tts_model=os.environ.get("BULBUL_MODEL", DEFAULT_BULBUL_MODEL),
            tts_voice=os.environ.get("BULBUL_VOICE", DEFAULT_BULBUL_VOICE),
            tts_sample_rate=_int_env("SARVAM_TTS_SAMPLE_RATE", DEFAULT_TTS_SAMPLE_RATE),
            tts_pace=_float_env("SARVAM_TTS_PACE", DEFAULT_TTS_PACE),
        )

    def require_api_key(self) -> str:
        if not self.api_key:
            raise ValueError(
                "SARVAM_API_KEY is not set - the STT and TTS adapters cannot authenticate."
            )
        return self.api_key


# --------------------------------------------------------------------------
# Job metadata
# --------------------------------------------------------------------------


def elder_context_from_metadata(raw: str | None) -> ElderContext:
    """Build the per-call context from the dispatch metadata.

    Who is on the call is the app's business, not the agent's: the token
    minting service puts the elder's name, language, and family circle in the
    job metadata, and this turns that JSON into the same `ElderContext` week 1
    already uses. Anything malformed degrades to defaults rather than killing
    the job - a call that starts in the wrong language is recoverable, a
    worker that crashes on join is not.
    """
    if not raw or not raw.strip():
        return ElderContext()

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return ElderContext()
    if not isinstance(payload, dict):
        return ElderContext()

    members: list[FamilyMember] = []
    for entry in payload.get("family_members") or []:
        if not isinstance(entry, dict):
            continue
        try:
            members.append(FamilyMember(**entry))
        except (TypeError, ValueError):
            continue

    fields = {
        key: payload[key]
        for key in ("elder_name", "language", "city", "today_iso", "approval_threshold_paise")
        if key in payload
    }
    try:
        return ElderContext(**fields, family_members=members)
    except ValueError:
        return ElderContext(family_members=members)
