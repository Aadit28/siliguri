"""Sarvam Bulbul TTS as a LiveKit Agents plugin.

Implements `livekit.agents.tts.TTS` (livekit-agents 1.x): `synthesize()`
returns a `ChunkedStream` whose `_run(output_emitter)` fills an `AudioEmitter`.
Capabilities declare `streaming=False`, so AgentSession puts its sentence
tokenizer in front and calls this once per clause - which is the "speak clause
1 while clause 2 generates" trick from the D.5 latency table, minus the
WebSocket. Moving to `wss://api.sarvam.ai/text-to-speech/ws` and implementing
`stream()` is the week-3 latency job.
"""

from __future__ import annotations

import base64

import httpx

try:
    from livekit.agents import (
        DEFAULT_API_CONNECT_OPTIONS,
        APIConnectionError,
        APIConnectOptions,
        APIStatusError,
        APITimeoutError,
        tts,
    )
except ImportError as exc:  # pragma: no cover - exercised by the extras guard test
    raise ImportError(
        "saathi_agent.voice.sarvam_tts needs the voice extra: "
        'pip install -e ".[voice]"'
    ) from exc

from .config import SarvamSettings, sarvam_language

SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"


class SarvamTTS(tts.TTS):
    """Bulbul over the REST endpoint, one request per clause."""

    def __init__(
        self,
        *,
        settings: SarvamSettings | None = None,
        api_key: str | None = None,
        model: str | None = None,
        speaker: str | None = None,
        language: str = "bn",
        target_language_code: str | None = None,
        sample_rate: int | None = None,
        pace: float | None = None,
        base_url: str = SARVAM_TTS_URL,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        resolved = settings or SarvamSettings.from_env()
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=sample_rate or resolved.tts_sample_rate,
            num_channels=1,
        )
        self._api_key = api_key or resolved.api_key
        self._model = model or resolved.tts_model
        self._speaker = speaker or resolved.tts_voice
        self._target_language_code = target_language_code or sarvam_language(language)
        self._pace = resolved.tts_pace if pace is None else pace
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

    def _payload(self, text: str) -> dict[str, object]:
        payload: dict[str, object] = {
            "text": text,
            "target_language_code": self._target_language_code,
            "speaker": self._speaker,
            "model": self._model,
            "pace": self._pace,
            "speech_sample_rate": self.sample_rate,
            "output_audio_codec": "wav",
        }
        return payload

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.ChunkedStream:
        return _SarvamChunkedStream(sarvam=self, input_text=text, conn_options=conn_options)

    async def aclose(self) -> None:
        if self._owns_http and self._http is not None:
            await self._http.aclose()
            self._http = None
        await super().aclose()


class _SarvamChunkedStream(tts.ChunkedStream):
    def __init__(
        self, *, sarvam: SarvamTTS, input_text: str, conn_options: APIConnectOptions
    ) -> None:
        super().__init__(tts=sarvam, input_text=input_text, conn_options=conn_options)
        self._sarvam = sarvam

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        sarvam = self._sarvam
        if not sarvam._api_key:
            raise ValueError("SARVAM_API_KEY is not set; SarvamTTS cannot authenticate.")

        try:
            response = await sarvam._session(self._conn_options.timeout).post(
                sarvam._base_url,
                headers={
                    "api-subscription-key": sarvam._api_key,
                    "Content-Type": "application/json",
                },
                json=sarvam._payload(self._input_text),
                timeout=self._conn_options.timeout,
            )
        except httpx.TimeoutException as exc:
            raise APITimeoutError("Sarvam TTS request timed out") from exc
        except httpx.HTTPError as exc:
            raise APIConnectionError(f"Sarvam TTS connection error: {exc}") from exc

        if response.status_code != 200:
            body = response.text
            raise APIStatusError(
                message=f"Sarvam TTS error ({response.status_code}): {body}",
                status_code=response.status_code,
                body=body,
            )

        payload = response.json()
        audios = payload.get("audios")
        if not audios or not isinstance(audios, list):
            raise APIConnectionError("Sarvam TTS returned no audio")

        output_emitter.initialize(
            request_id=payload.get("request_id") or "unknown",
            sample_rate=sarvam.sample_rate,
            num_channels=sarvam.num_channels,
            mime_type="audio/wav",
        )
        for chunk in audios:
            output_emitter.push(base64.b64decode(chunk))
