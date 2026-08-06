"""Sarvam Bulbul TTS as a LiveKit Agents plugin.

Two paths behind one class, chosen at construction:

- **streaming** (default): the Bulbul WebSocket. The reply is split into
  sentences here and pushed as it is tokenized, so audio for sentence one is
  already playing while sentence two is still being generated. This is the
  "speak clause 1 while clause 2 generates" trick from the D.5 latency table,
  now with the socket.
- **REST**: the week-2 path, kept whole. `SARVAM_STREAMING=0` selects it, and
  a socket that will not open falls back to it for that segment.

Who tokenizes, and why it is us: the framework only puts its sentence
tokenizer in front of a TTS whose capabilities say `streaming=False` (that is
`tts.StreamAdapter`). Declare `streaming=True` and the framework hands the
reply straight through as text - so a streaming plugin owns its own
sentence splitting, which is what `_tokenize_input` below does. Getting this
wrong is silent: the whole reply would be one synthesis request and the first
audio would arrive a sentence-and-a-half late.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Callable

import httpx

try:
    import aiohttp
    from livekit.agents import (
        DEFAULT_API_CONNECT_OPTIONS,
        APIConnectionError,
        APIConnectOptions,
        APIStatusError,
        APITimeoutError,
        tokenize,
        tts,
        utils,
    )
except ImportError as exc:  # pragma: no cover - exercised by the extras guard test
    raise ImportError(
        "saathi_agent.voice.sarvam_tts needs the voice extra: "
        'pip install -e ".[voice]"'
    ) from exc

from . import sarvam_ws
from .cache import first_wav, pcm_from_wav
from .config import SarvamSettings, bulbul_rest_payload, sarvam_language, tts_mime_type

logger = logging.getLogger("saathi.voice.tts")

SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"

#: Bulbul v3 buffering. Small buffer = the first chunk leaves sooner, which is
#: the only reason to be on a socket at all.
TTS_MIN_BUFFER_SIZE = 50
TTS_MAX_CHUNK_LENGTH = 150

#: Emitter frame size. 50ms keeps the room fed without a 200ms first-frame
#: wait on top of everything else.
TTS_FRAME_SIZE_MS = 50


class SarvamTTS(tts.TTS):
    """Bulbul, over the WebSocket when it can and REST when it cannot."""

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
        streaming: bool | None = None,
        ws_url: str | None = None,
        codec: str | None = None,
        sentence_tokenizer: tokenize.SentenceTokenizer | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        resolved = settings or SarvamSettings.from_env()
        self._streaming = resolved.streaming if streaming is None else streaming
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=self._streaming),
            sample_rate=sample_rate or resolved.tts_sample_rate,
            num_channels=1,
        )
        self._api_key = api_key or resolved.api_key
        self._model = model or resolved.tts_model
        self._speaker = speaker or resolved.tts_voice
        self._target_language_code = target_language_code or sarvam_language(language)
        self._pace = resolved.tts_pace if pace is None else pace
        self._base_url = base_url
        self._ws_url = ws_url or resolved.tts_ws_url
        self._codec = codec or resolved.tts_codec
        self._mime_type = tts_mime_type(self._codec)
        self._tokenizer = sentence_tokenizer or tokenize.basic.SentenceTokenizer()
        self._http = http_client
        self._owns_http = http_client is None
        self._ws_unavailable = False

        #: Stamped by the worker's per-turn clock on the first audio chunk of
        #: a reply. An attribute rather than a constructor argument because
        #: the adapter outlives any one turn.
        self.first_chunk_hook: Callable[[], None] | None = None

    @property
    def model(self) -> str:
        return self._model

    @property
    def streaming_enabled(self) -> bool:
        return self._streaming

    def _session(self, timeout: float) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=timeout)
        return self._http

    def _payload(self, text: str) -> dict[str, object]:
        return bulbul_rest_payload(
            text=text,
            target_language_code=self._target_language_code,
            speaker=self._speaker,
            model=self._model,
            pace=self._pace,
            sample_rate=self.sample_rate,
            output_audio_codec="wav",
        )

    def note_first_chunk(self) -> None:
        """Fire the latency hook once, and never let it break the audio."""
        hook, self.first_chunk_hook = self.first_chunk_hook, None
        if hook is None:
            return
        try:
            hook()
        except Exception:  # pragma: no cover - a metrics bug must not mute the agent
            logger.exception("first-chunk latency hook raised; audio continues")

    async def rest_wav(self, text: str, *, timeout: float) -> bytes:
        """One REST synthesis, WAV bytes out. Shared with the cache warmer."""
        if not self._api_key:
            raise ValueError("SARVAM_API_KEY is not set; SarvamTTS cannot authenticate.")
        try:
            response = await self._session(timeout).post(
                self._base_url,
                headers={
                    "api-subscription-key": self._api_key,
                    "Content-Type": "application/json",
                },
                json=self._payload(text),
                timeout=timeout,
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
        return first_wav(audios)

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.ChunkedStream:
        return _SarvamChunkedStream(sarvam=self, input_text=text, conn_options=conn_options)

    def stream(
        self, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.SynthesizeStream:
        if not self._streaming:
            raise NotImplementedError(
                "SarvamTTS was built with streaming off (SARVAM_STREAMING=0); "
                "AgentSession should be using the sentence StreamAdapter instead."
            )
        return _SarvamSynthesizeStream(sarvam=self, conn_options=conn_options)

    async def aclose(self) -> None:
        if self._owns_http and self._http is not None:
            await self._http.aclose()
            self._http = None
        await super().aclose()


class _SarvamChunkedStream(tts.ChunkedStream):
    """REST: one request per clause, the whole clause before any audio."""

    def __init__(
        self, *, sarvam: SarvamTTS, input_text: str, conn_options: APIConnectOptions
    ) -> None:
        super().__init__(tts=sarvam, input_text=input_text, conn_options=conn_options)
        self._sarvam = sarvam

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        wav = await self._sarvam.rest_wav(self._input_text, timeout=self._conn_options.timeout)
        output_emitter.initialize(
            request_id=utils.shortuuid(),
            sample_rate=self._sarvam.sample_rate,
            num_channels=self._sarvam.num_channels,
            mime_type="audio/wav",
        )
        self._sarvam.note_first_chunk()
        output_emitter.push(wav)


class _SarvamSynthesizeStream(tts.SynthesizeStream):
    """WebSocket: sentence in, audio out, one segment per `say()`."""

    def __init__(self, *, sarvam: SarvamTTS, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=sarvam, conn_options=conn_options)
        self._sarvam = sarvam
        self._segments_ch: utils.aio.Chan[tokenize.SentenceStream] = utils.aio.Chan()

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        # Re-created because the base class replays the input buffer into a
        # fresh channel when it retries `_run`.
        self._segments_ch = utils.aio.Chan()
        output_emitter.initialize(
            request_id=utils.shortuuid(),
            sample_rate=self._sarvam.sample_rate,
            num_channels=self._sarvam.num_channels,
            mime_type=self._sarvam._mime_type,
            stream=True,
            frame_size_ms=TTS_FRAME_SIZE_MS,
        )

        async def _tokenize_input() -> None:
            """Text in, sentences out. The reply is not held to be split."""
            sentences: tokenize.SentenceStream | None = None
            async for chunk in self._input_ch:
                if isinstance(chunk, str):
                    if sentences is None:
                        sentences = self._sarvam._tokenizer.stream()
                        self._segments_ch.send_nowait(sentences)
                    sentences.push_text(chunk)
                elif isinstance(chunk, self._FlushSentinel):
                    if sentences is not None:
                        sentences.end_input()
                    sentences = None
            if sentences is not None:
                sentences.end_input()
            self._segments_ch.close()

        async def _speak_segments() -> None:
            async for sentences in self._segments_ch:
                await self._run_segment(sentences, output_emitter)

        tasks = [
            asyncio.create_task(_tokenize_input()),
            asyncio.create_task(_speak_segments()),
        ]
        try:
            await asyncio.gather(*tasks)
        except (APIStatusError, APIConnectionError, APITimeoutError):
            raise
        except asyncio.TimeoutError as exc:
            raise APITimeoutError("Sarvam TTS stream timed out") from exc
        except Exception as exc:
            raise APIConnectionError(f"Sarvam TTS stream failed: {exc}") from exc
        finally:
            await utils.aio.cancel_and_wait(*tasks)
            output_emitter.end_input()

    async def _run_segment(
        self, sentences: tokenize.SentenceStream, output_emitter: tts.AudioEmitter
    ) -> None:
        output_emitter.start_segment(segment_id=utils.shortuuid())
        try:
            if self._sarvam._ws_unavailable:
                await self._speak_rest(sentences, output_emitter, "socket already known bad")
                return

            session = aiohttp.ClientSession()
            try:
                try:
                    ws = await asyncio.wait_for(
                        session.ws_connect(
                            sarvam_ws.tts_ws_url(self._sarvam._ws_url, model=self._sarvam._model),
                            headers={"api-subscription-key": self._sarvam._api_key},
                        ),
                        self._conn_options.timeout,
                    )
                except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as exc:
                    self._sarvam._ws_unavailable = True
                    await self._speak_rest(sentences, output_emitter, f"socket refused: {exc}")
                    return

                try:
                    await self._pump(ws, sentences, output_emitter)
                finally:
                    if not ws.closed:
                        await ws.close()
            finally:
                await session.close()
        finally:
            # Every path that opened a segment closes it, degraded ones
            # included - a segment left open makes the base class fail the
            # whole synthesis on a count mismatch.
            output_emitter.end_segment()

    async def _pump(
        self,
        ws: aiohttp.ClientWebSocketResponse,
        sentences: tokenize.SentenceStream,
        output_emitter: tts.AudioEmitter,
    ) -> None:
        configured = asyncio.Event()

        async def send() -> None:
            try:
                await ws.send_str(
                    sarvam_ws.tts_config_frame(
                        target_language_code=self._sarvam._target_language_code,
                        speaker=self._sarvam._speaker,
                        model=self._sarvam._model,
                        pace=self._sarvam._pace,
                        sample_rate=self._sarvam.sample_rate,
                        output_audio_codec=self._sarvam._codec,
                        min_buffer_size=TTS_MIN_BUFFER_SIZE,
                        max_chunk_length=TTS_MAX_CHUNK_LENGTH,
                    )
                )
                configured.set()
                async for sentence in sentences:
                    self._mark_started()
                    await ws.send_str(sarvam_ws.tts_text_frame(sentence.token))
                await ws.send_str(sarvam_ws.tts_flush_frame())
            except (aiohttp.ClientError, ConnectionResetError) as exc:
                raise APIConnectionError(f"Sarvam TTS send failed: {exc}") from exc
            finally:
                configured.set()

        async def receive() -> None:
            await configured.wait()
            async for message in ws:
                if message.type != aiohttp.WSMsgType.TEXT:
                    if message.type == aiohttp.WSMsgType.ERROR:
                        raise APIConnectionError(f"Sarvam TTS socket error: {ws.exception()}")
                    break
                chunk = sarvam_ws.decode_tts_message(message.data)
                if chunk.kind == "audio":
                    self._sarvam.note_first_chunk()
                    output_emitter.push(chunk.audio)
                elif chunk.kind == "final":
                    return
                elif chunk.kind == "error":
                    raise APIStatusError(
                        message=f"Sarvam TTS error: {chunk.message}",
                        status_code=-1,
                        body=chunk.message,
                    )

        tasks = [asyncio.create_task(send()), asyncio.create_task(receive())]
        try:
            await asyncio.gather(*tasks)
        finally:
            configured.set()
            await utils.aio.cancel_and_wait(*tasks)

    async def _speak_rest(
        self,
        sentences: tokenize.SentenceStream,
        output_emitter: tts.AudioEmitter,
        why: str,
    ) -> None:
        """Degraded segment: collect the sentences, one REST call, push it."""
        logger.warning("Bulbul streaming unavailable, using REST for this reply: %s", why)
        text = "".join(sentence.token async for sentence in sentences).strip()
        if not text:
            return
        self._mark_started()
        wav = await self._sarvam.rest_wav(text, timeout=self._conn_options.timeout)
        self._sarvam.note_first_chunk()
        if self._sarvam._mime_type == "audio/pcm":
            # The emitter was told to expect raw PCM, so the container has to
            # come off here rather than confusing a decoder that is not there.
            pcm, _, _ = pcm_from_wav(wav)
            output_emitter.push(pcm)
        else:
            output_emitter.push(wav)

    async def aclose(self) -> None:
        self._segments_ch.close()
        await super().aclose()
