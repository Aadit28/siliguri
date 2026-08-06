"""The Sarvam WebSocket contract, as pure functions.

No LiveKit, no socket, no network. Everything that decides *what bytes go on
the wire* and *what a server frame means* lives here, so the part of the
streaming adapters that can actually be wrong is testable in the base test
run - the one that has no audio stack and no API key.

`sarvam_stt.py` and `sarvam_tts.py` are then thin: open the socket, pump
frames through these functions, map the results onto LiveKit's event types.

Contract provenance, honestly labelled - this is guesswork-sensitive code:

- **Documented** (docs.sarvam.ai, `speech-to-text/transcribe/ws` and
  `text-to-speech/stream`): both endpoint URLs, `api-subscription-key` as a
  handshake header, the STT query-parameter names and enums, the STT client
  audio frame `{"audio": {"data", "encoding", "sample_rate"}}`, `{"type":
  "flush"}` gated on `flush_signal=true`, the STT server frames
  `{"type": "data"|"events"|"error", ...}` with `START_SPEECH`/`END_SPEECH`
  signals, and the TTS `config`/`text`/`flush`/`ping` client frames and
  `audio`/`event`/`error` server frames.
- **Cross-checked** against the official `livekit-plugins-sarvam` 1.6.8
  adapter, which is what settles the ambiguities the docs leave: audio is
  base64 of raw little-endian int16 (no WAV container) even though the
  `encoding` field says `audio/wav`, and the TTS audio payload is at
  `data.audio`.
- **TODO / undocumented.** `{"type": "end_of_stream"}` is not in the Sarvam
  docs; it is what the official plugin sends and is harmless if ignored.
- **TODO / inferred.** Saaras v3 has no interim frame today: the socket emits
  one VAD-gated `data` message per utterance and there is no `is_final` field
  in the documented schema. `_looks_interim` is a forward-compatible hook -
  if a partial ever arrives carrying `is_final: false` (or a `partial` type)
  it is surfaced as INTERIM rather than being mistaken for a final transcript,
  which is the failure that would let half a sentence answer a readback.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlencode

# --------------------------------------------------------------------------
# STT: client -> server
# --------------------------------------------------------------------------

#: Only `saaras:*` takes a mode; sending it to a saarika model is a 400.
MODE_CAPABLE_PREFIX = "saaras"

#: What the `encoding` field carries when no explicit codec is configured.
#: The bytes are raw int16 regardless - this is the string the official
#: adapter sends and Sarvam accepts, not a description of a container.
DEFAULT_AUDIO_ENCODING = "audio/wav"

#: 50ms of audio per frame. Small enough that the first partial is not held
#: behind a buffer, big enough that a 16kHz call is ~20 sends a second.
CHUNK_DURATION_MS = 50


def stt_chunk_samples(sample_rate: int, *, duration_ms: int = CHUNK_DURATION_MS) -> int:
    return max(int(sample_rate * duration_ms / 1000), 1)


def stt_ws_url(
    base_url: str,
    *,
    model: str,
    language: str,
    sample_rate: int,
    mode: str = "transcribe",
    input_audio_codec: str | None = None,
    vad_signals: bool = True,
    flush_signal: bool = True,
    high_vad_sensitivity: bool | None = None,
) -> str:
    """Query string for the Saaras socket.

    `vad_signals` is on by default and is not really optional for us: the
    START_SPEECH/END_SPEECH frames are the only end-of-utterance marker the
    socket gives, and without them a final transcript has nothing to close.
    """
    params: dict[str, str] = {
        "language-code": language,
        "model": model,
        "sample_rate": str(sample_rate),
        "vad_signals": str(vad_signals).lower(),
        "flush_signal": str(flush_signal).lower(),
    }
    if model.startswith(MODE_CAPABLE_PREFIX):
        params["mode"] = mode
    if input_audio_codec:
        params["input_audio_codec"] = input_audio_codec
    if high_vad_sensitivity is not None:
        params["high_vad_sensitivity"] = str(high_vad_sensitivity).lower()
    return f"{base_url}?{urlencode(params)}"


def stt_audio_frame(pcm: bytes, *, encoding: str, sample_rate: int) -> str:
    """One audio message: base64 of raw little-endian int16 samples."""
    return json.dumps(
        {
            "audio": {
                "data": base64.b64encode(pcm).decode("ascii"),
                "encoding": encoding,
                "sample_rate": sample_rate,
            }
        }
    )


def stt_flush_frame() -> str:
    """Ask for the pending transcript now. Needs `flush_signal=true` on the URL."""
    return json.dumps({"type": "flush"})


def stt_end_of_stream_frame(*, encoding: str, sample_rate: int) -> str:
    """TODO(sarvam-docs): undocumented; taken from the official plugin."""
    return json.dumps(
        {
            "type": "end_of_stream",
            "audio": {"data": "", "encoding": encoding, "sample_rate": sample_rate},
        }
    )


# --------------------------------------------------------------------------
# STT: server -> client
# --------------------------------------------------------------------------

STTEventKind = Literal[
    "start_of_speech", "interim", "final", "end_of_speech", "usage", "error"
]


@dataclass(frozen=True)
class STTEvent:
    """One decoded server event, in LiveKit's vocabulary but not its types."""

    kind: STTEventKind
    text: str = ""
    language: str = ""
    request_id: str = ""
    audio_duration: float = 0.0
    message: str = ""
    status_code: int | None = None


def _as_dict(raw: str | bytes | dict[str, Any]) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", "replace")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError(f"expected a JSON object, got {type(payload).__name__}")
    return payload


def _looks_interim(message: dict[str, Any], data: dict[str, Any]) -> bool:
    """TODO(sarvam-docs): no documented partial frame exists yet - see module
    docstring. Both spellings are checked so that whichever one Sarvam ships,
    a partial is never promoted to a final."""
    if str(message.get("type", "")).lower() in {"partial", "interim"}:
        return True
    for source in (data, message):
        flag = source.get("is_final")
        if isinstance(flag, bool) and not flag:
            return True
    return False


def _error_text(message: dict[str, Any], data: dict[str, Any]) -> str:
    for source in (data, message):
        for key in ("message", "error", "detail"):
            value = source.get(key)
            if isinstance(value, str) and value:
                return value
    return json.dumps(message, ensure_ascii=False)[:500]


class SarvamSTTDecoder:
    """Server frames in, ordered logical events out.

    The ordering is the reason this is a class and not a function. LiveKit
    expects FINAL before END_OF_SPEECH, and Sarvam sends END_SPEECH (a VAD
    signal) before the transcript it closes. So an END_SPEECH with no final
    yet is *held*, and released the moment the transcript lands - or by
    `force_end_of_speech()` if it never does.
    """

    def __init__(self) -> None:
        self._speaking = False
        self._final_seen = False
        self._pending_eos = False
        self._eos_emitted = False
        self._should_flush = False
        self.request_id = ""

    # -- flush handshake -------------------------------------------------
    @property
    def should_flush(self) -> bool:
        return self._should_flush

    @property
    def pending_end_of_speech(self) -> bool:
        """An END_SPEECH is being held back until its transcript arrives."""
        return self._pending_eos

    def take_flush(self) -> bool:
        """Consume the pending flush request, if any.

        Read by the *send* task so the flush frame leaves on the same socket
        writer as the audio; two tasks writing one WebSocket interleave.
        """
        pending, self._should_flush = self._should_flush, False
        return pending

    # -- decoding --------------------------------------------------------
    def feed(self, raw: str | bytes | dict[str, Any]) -> list[STTEvent]:
        message = _as_dict(raw)
        data = message.get("data")
        if not isinstance(data, dict):
            data = {}

        kind = str(message.get("type", "")).lower()
        request_id = data.get("request_id") or message.get("request_id")
        if isinstance(request_id, str) and request_id:
            self.request_id = request_id

        if kind in {"error", "errors"} or "error" in message or "error" in data:
            return [
                STTEvent(
                    kind="error",
                    request_id=self.request_id,
                    message=_error_text(message, data),
                    status_code=data.get("code") if isinstance(data.get("code"), int) else None,
                )
            ]
        if kind in {"events", "event"}:
            return self._on_signal(str(data.get("signal_type", "")).upper())
        if kind in {"data", "partial", "interim"} or "transcript" in data:
            return self._on_transcript(message, data)
        return []

    def _on_signal(self, signal: str) -> list[STTEvent]:
        if signal == "START_SPEECH":
            if self._speaking:
                return []
            self._reset_utterance()
            self._speaking = True
            return [STTEvent(kind="start_of_speech", request_id=self.request_id)]

        if signal == "END_SPEECH":
            if not self._speaking:
                return []
            self._speaking = False
            self._pending_eos = True
            # Sarvam holds the transcript until it is asked for it.
            self._should_flush = True
            if self._final_seen:
                return self._emit_eos()
            # Held: the final has not arrived, and END_OF_SPEECH before
            # FINAL_TRANSCRIPT makes the framework close the turn on an empty
            # utterance - the elder says something and the agent answers
            # nothing.
            return []
        return []

    def _on_transcript(self, message: dict[str, Any], data: dict[str, Any]) -> list[STTEvent]:
        text = data.get("transcript") or ""
        if not isinstance(text, str):
            text = str(text)
        language = data.get("language_code")
        language = language if isinstance(language, str) else ""

        events: list[STTEvent] = []
        if text and _looks_interim(message, data):
            return [
                STTEvent(
                    kind="interim", text=text, language=language, request_id=self.request_id
                )
            ]

        if text:
            self._final_seen = True
            events.append(
                STTEvent(kind="final", text=text, language=language, request_id=self.request_id)
            )

        metrics = data.get("metrics")
        if isinstance(metrics, dict):
            duration = metrics.get("audio_duration")
            if isinstance(duration, (int, float)) and duration > 0:
                events.append(
                    STTEvent(
                        kind="usage",
                        request_id=self.request_id,
                        audio_duration=float(duration),
                    )
                )

        if self._pending_eos and self._final_seen:
            events.extend(self._emit_eos())
        return events

    def force_end_of_speech(self) -> list[STTEvent]:
        """Release a held END_OF_SPEECH without its transcript.

        The safety valve for a final that never lands: without it the turn
        never closes and the elder waits on a socket that has gone quiet.
        """
        if not self._pending_eos:
            return []
        return self._emit_eos()

    def _emit_eos(self) -> list[STTEvent]:
        if self._eos_emitted:
            return []
        self._eos_emitted = True
        self._pending_eos = False
        return [STTEvent(kind="end_of_speech", request_id=self.request_id)]

    def _reset_utterance(self) -> None:
        self._final_seen = False
        self._pending_eos = False
        self._eos_emitted = False


# --------------------------------------------------------------------------
# TTS
# --------------------------------------------------------------------------

#: Models that take the v3 generation knobs. v2 takes pitch/loudness instead.
_V3_MODELS = frozenset({"bulbul:v3", "bulbul:v3-beta"})


def tts_ws_url(base_url: str, *, model: str, send_completion_event: bool = True) -> str:
    """`send_completion_event` is what turns the `final` event on; without it
    the recv loop cannot tell "done" from "still generating"."""
    return f"{base_url}?{urlencode({'model': model, 'send_completion_event': str(send_completion_event).lower()})}"


def tts_config_frame(
    *,
    target_language_code: str,
    speaker: str,
    model: str,
    pace: float,
    sample_rate: int,
    output_audio_codec: str,
    min_buffer_size: int | None = None,
    max_chunk_length: int | None = None,
) -> str:
    data: dict[str, Any] = {
        "target_language_code": target_language_code,
        "speaker": speaker,
        "model": model,
        "pace": pace,
        "speech_sample_rate": sample_rate,
        "output_audio_codec": output_audio_codec,
    }
    if model in _V3_MODELS:
        # Smaller buffers mean the first chunk leaves sooner, which is the
        # whole point of the socket.
        if min_buffer_size is not None:
            data["min_buffer_size"] = min_buffer_size
        if max_chunk_length is not None:
            data["max_chunk_length"] = max_chunk_length
    return json.dumps({"type": "config", "data": data}, ensure_ascii=False)


def tts_text_frame(text: str) -> str:
    return json.dumps({"type": "text", "data": {"text": text}}, ensure_ascii=False)


def tts_flush_frame() -> str:
    return json.dumps({"type": "flush"})


TTSChunkKind = Literal["audio", "final", "error", "ignored"]


@dataclass(frozen=True)
class TTSChunk:
    kind: TTSChunkKind
    audio: bytes = b""
    message: str = ""
    request_id: str = ""


def decode_tts_message(raw: str | bytes | dict[str, Any]) -> TTSChunk:
    """One server frame -> audio bytes, the terminal event, or an error."""
    message = _as_dict(raw)
    data = message.get("data")
    if not isinstance(data, dict):
        data = {}
    request_id = data.get("request_id") if isinstance(data.get("request_id"), str) else ""
    kind = str(message.get("type", "")).lower()

    if kind == "audio":
        encoded = data.get("audio") or ""
        if not encoded:
            return TTSChunk(kind="ignored", request_id=request_id)
        try:
            return TTSChunk(kind="audio", audio=base64.b64decode(encoded), request_id=request_id)
        except (ValueError, TypeError) as exc:
            # A corrupt chunk is a gap in the sentence, not a dead call: the
            # recv loop keeps going and the elder hears a clipped word.
            return TTSChunk(kind="ignored", message=f"undecodable audio: {exc}")
    if kind in {"event", "events"}:
        if str(data.get("event_type", "")).lower() == "final":
            return TTSChunk(kind="final", request_id=request_id)
        return TTSChunk(kind="ignored", request_id=request_id)
    if kind in {"error", "errors"} or "error" in message or "error" in data:
        return TTSChunk(kind="error", message=_error_text(message, data), request_id=request_id)
    return TTSChunk(kind="ignored", request_id=request_id)
