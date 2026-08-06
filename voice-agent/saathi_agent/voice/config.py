"""Voice-layer settings: env wiring, elder tuning numbers, job metadata.

Deliberately free of LiveKit and Sarvam imports. The tuning constants and the
metadata contract are the parts most likely to be got wrong, so they live
where the base test run can still reach them.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from ..prompts import ElderContext, FamilyMember

#: `voice-agent/` - the package lives at `<root>/saathi_agent/voice/config.py`.
PACKAGE_ROOT = Path(__file__).resolve().parents[2]

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

# --------------------------------------------------------------------------
# Streaming (week 3, BUILD_GUIDE D.5)
# --------------------------------------------------------------------------

#: Saaras streaming socket. Overridable because the contract below is pinned to
#: what Sarvam documents today; a moved endpoint should be an env change.
DEFAULT_STT_WS_URL = "wss://api.sarvam.ai/speech-to-text/ws"
DEFAULT_TTS_WS_URL = "wss://api.sarvam.ai/text-to-speech/ws"

#: The socket takes 16k or 8k only. 8000 is the Exotel phone channel (D.9).
DEFAULT_STT_SAMPLE_RATE = 16000

#: `linear16` is raw PCM, which the emitter takes as `audio/pcm` and hands
#: straight to the room - no decoder, no `livekit-agents[codecs]` extra, and
#: none of the container framing that the WAV path gets wrong on a socket.
DEFAULT_TTS_CODEC = "linear16"

TTS_CODEC_TO_MIME: dict[str, str] = {
    "linear16": "audio/pcm",
    "wav": "audio/wav",
    "mp3": "audio/mp3",
    "opus": "audio/opus",
    "flac": "audio/flac",
    "aac": "audio/aac",
}

#: `SARVAM_STREAMING=0` puts both adapters back on REST. One switch, because
#: the failure they degrade from is the same one: the socket is unreachable or
#: the contract moved, and a call that still completes on REST beats a call
#: that does not happen.
DEFAULT_STREAMING = True

#: Pre-synthesized fixed frames (greeting, re-prompt, apology, close).
DEFAULT_TTS_CACHE_DIR = PACKAGE_ROOT / ".cache" / "tts"

#: Per-turn latency records, one JSONL file per call.
DEFAULT_METRICS_DIR = PACKAGE_ROOT / ".metrics"

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


#: Anything else - including a typo - leaves streaming on. Turning the socket
#: off is the deliberate act; a misspelled value must not silently do it.
_FALSEY = frozenset({"0", "false", "no", "off"})


def _bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() not in _FALSEY


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
    streaming: bool = DEFAULT_STREAMING
    stt_ws_url: str = DEFAULT_STT_WS_URL
    tts_ws_url: str = DEFAULT_TTS_WS_URL
    stt_sample_rate: int = DEFAULT_STT_SAMPLE_RATE
    tts_codec: str = DEFAULT_TTS_CODEC

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
            streaming=_bool_env("SARVAM_STREAMING", DEFAULT_STREAMING),
            stt_ws_url=os.environ.get("SARVAM_STT_WS_URL") or DEFAULT_STT_WS_URL,
            tts_ws_url=os.environ.get("SARVAM_TTS_WS_URL") or DEFAULT_TTS_WS_URL,
            stt_sample_rate=_int_env("SARVAM_STT_SAMPLE_RATE", DEFAULT_STT_SAMPLE_RATE),
            tts_codec=os.environ.get("SARVAM_TTS_CODEC") or DEFAULT_TTS_CODEC,
        )

    def require_api_key(self) -> str:
        if not self.api_key:
            raise ValueError(
                "SARVAM_API_KEY is not set - the STT and TTS adapters cannot authenticate."
            )
        return self.api_key


def tts_mime_type(codec: str) -> str:
    """Emitter MIME for a Bulbul `output_audio_codec`.

    An unknown codec is not guessed at: the emitter would hand the bytes to a
    decoder that cannot read them and the elder would hear silence, which is
    harder to debug than a startup error.
    """
    try:
        return TTS_CODEC_TO_MIME[codec]
    except KeyError:
        raise ValueError(
            f"Unsupported SARVAM_TTS_CODEC {codec!r}; known: {sorted(TTS_CODEC_TO_MIME)}"
        ) from None


def bulbul_rest_payload(
    *,
    text: str,
    target_language_code: str,
    speaker: str,
    model: str,
    pace: float,
    sample_rate: int,
    output_audio_codec: str = "wav",
) -> dict[str, object]:
    """The `/text-to-speech` REST body.

    Shared so the live adapter and the cache warmer cannot drift: a cached
    greeting synthesized with different settings than the live path is a voice
    that changes halfway through the call.
    """
    return {
        "text": text,
        "target_language_code": target_language_code,
        "speaker": speaker,
        "model": model,
        "pace": pace,
        "speech_sample_rate": sample_rate,
        "output_audio_codec": output_audio_codec,
    }


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
