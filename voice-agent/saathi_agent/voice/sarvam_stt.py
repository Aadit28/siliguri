"""Sarvam Saaras STT as a LiveKit Agents plugin.

Implements the real `livekit.agents.stt.STT` base class (livekit-agents 1.x):
one abstract method, `_recognize_impl`, taking a buffer of audio frames and
returning a `SpeechEvent`. Declaring `streaming=False` is not a limitation -
AgentSession wraps a non-streaming STT in its VAD-driven stream adapter, which
is exactly where the 700ms elder endpointing (D.4) is applied. Swapping in the
Saaras WebSocket for streaming partials is the week-3 latency job (D.5); doing
it now would mean guessing at a frame protocol we cannot exercise offline.

An official `livekit-plugins-sarvam` exists and is the drop-in alternative;
this adapter is here because the agent needs the model, mode and language
policy pinned to the elder use case (auto language detection for mid-sentence
Benglish, `transcribe` never `translate` - the booking must stay in the
elder's own words).
"""

from __future__ import annotations

import httpx

try:
    from livekit import rtc
    from livekit.agents import (
        DEFAULT_API_CONNECT_OPTIONS,
        NOT_GIVEN,
        APIConnectionError,
        APIConnectOptions,
        APIStatusError,
        APITimeoutError,
        NotGivenOr,
        stt,
        utils,
    )
except ImportError as exc:  # pragma: no cover - exercised by the extras guard test
    raise ImportError(
        "saathi_agent.voice.sarvam_stt needs the voice extra: "
        'pip install -e ".[voice]"'
    ) from exc

from .config import SarvamSettings

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"

#: Only `saaras:*` takes a mode; sending it to a saarika model is a 400.
_MODE_CAPABLE_PREFIX = "saaras"


class SarvamSTT(stt.STT):
    """Saaras v3 over the REST endpoint."""

    def __init__(
        self,
        *,
        settings: SarvamSettings | None = None,
        api_key: str | None = None,
        model: str | None = None,
        language: str | None = None,
        mode: str = "transcribe",
        base_url: str = SARVAM_STT_URL,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        super().__init__(capabilities=stt.STTCapabilities(streaming=False, interim_results=False))
        resolved = settings or SarvamSettings.from_env()
        self._api_key = api_key or resolved.api_key
        self._model = model or resolved.stt_model
        self._language = language or resolved.stt_language
        self._mode = mode
        self._base_url = base_url
        self._http = http_client
        self._owns_http = http_client is None

    @property
    def model(self) -> str:
        return self._model

    def _session(self, timeout: float) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=timeout)
        return self._http

    async def _recognize_impl(
        self,
        buffer: utils.AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.SpeechEvent:
        if not self._api_key:
            raise ValueError("SARVAM_API_KEY is not set; SarvamSTT cannot authenticate.")

        wav_bytes = rtc.combine_audio_frames(buffer).to_wav_bytes()
        requested_language = language if isinstance(language, str) else self._language

        form: dict[str, str] = {"model": self._model}
        if requested_language:
            form["language_code"] = requested_language
        if self._model.startswith(_MODE_CAPABLE_PREFIX):
            form["mode"] = self._mode

        try:
            response = await self._session(conn_options.timeout).post(
                self._base_url,
                headers={"api-subscription-key": self._api_key},
                files={"file": ("audio.wav", wav_bytes, "audio/wav")},
                data=form,
                timeout=conn_options.timeout,
            )
        except httpx.TimeoutException as exc:
            raise APITimeoutError("Sarvam STT request timed out") from exc
        except httpx.HTTPError as exc:
            raise APIConnectionError(f"Sarvam STT connection error: {exc}") from exc

        if response.status_code != 200:
            body = response.text
            raise APIStatusError(
                message=f"Sarvam STT error ({response.status_code}): {body}",
                status_code=response.status_code,
                body=body,
            )

        payload = response.json()
        detected = payload.get("language_code")
        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            request_id=payload.get("request_id", ""),
            alternatives=[
                stt.SpeechData(
                    language=detected if isinstance(detected, str) else (requested_language or ""),
                    text=payload.get("transcript", "") or "",
                )
            ],
        )

    async def aclose(self) -> None:
        if self._owns_http and self._http is not None:
            await self._http.aclose()
            self._http = None
        await super().aclose()
