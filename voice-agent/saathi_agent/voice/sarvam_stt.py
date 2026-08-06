"""Sarvam Saaras STT as a LiveKit Agents plugin.

Two paths behind one class, chosen at construction:

- **streaming** (default): the Saaras WebSocket. Audio goes up in 50ms
  base64 frames as it arrives, Sarvam's own VAD closes the utterance, and the
  transcript comes back without waiting for the framework to decide the turn
  is over. This is the week-3 latency job (BUILD_GUIDE D.5) - it removes a
  whole upload-after-endpointing round trip from every turn.
- **REST**: the week-2 path, kept whole. `SARVAM_STREAMING=0` selects it, and
  a socket that will not open falls back to it mid-call rather than failing
  the turn.

`streaming=False` in the capabilities is not a defeat either way: AgentSession
wraps a non-streaming STT in its VAD-driven stream adapter, which is where the
700ms elder endpointing (D.4) is applied. With the socket on, Sarvam's VAD and
the framework's both run - the framework's still owns turn-taking, and the
socket's only decides when Sarvam has heard enough to transcribe.

The wire contract lives in `sarvam_ws.py`, with its documented-vs-inferred
provenance spelled out there. An official `livekit-plugins-sarvam` exists and
is the drop-in alternative; this adapter is here because the agent needs the
model, mode and language policy pinned to the elder use case (auto language
detection for mid-sentence Benglish, `transcribe` never `translate` - the
booking must stay in the elder's own words).
"""

from __future__ import annotations

import asyncio
import logging

import httpx

try:
    import aiohttp
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

from . import sarvam_ws
from .config import SarvamSettings

logger = logging.getLogger("saathi.voice.stt")

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"

#: Only `saaras:*` takes a mode; sending it to a saarika model is a 400.
_MODE_CAPABLE_PREFIX = sarvam_ws.MODE_CAPABLE_PREFIX

#: How long a held END_OF_SPEECH waits for the transcript that should precede
#: it before being released anyway. A turn that never closes is worse than a
#: turn that closes on an empty transcript.
EOS_FALLBACK_S = 1.0


class SarvamSTT(stt.STT):
    """Saaras v3, over the WebSocket when it can and REST when it cannot."""

    def __init__(
        self,
        *,
        settings: SarvamSettings | None = None,
        api_key: str | None = None,
        model: str | None = None,
        language: str | None = None,
        mode: str = "transcribe",
        base_url: str = SARVAM_STT_URL,
        streaming: bool | None = None,
        ws_url: str | None = None,
        sample_rate: int | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        resolved = settings or SarvamSettings.from_env()
        self._streaming = resolved.streaming if streaming is None else streaming
        super().__init__(
            capabilities=stt.STTCapabilities(
                streaming=self._streaming,
                # Saaras v3 emits one VAD-gated transcript per utterance today,
                # so this is a promise about the path, not about how chatty the
                # socket is. See `_looks_interim` in sarvam_ws.py.
                interim_results=self._streaming,
            )
        )
        self._api_key = api_key or resolved.api_key
        self._model = model or resolved.stt_model
        self._language = language or resolved.stt_language
        self._mode = mode
        self._base_url = base_url
        self._ws_url = ws_url or resolved.stt_ws_url
        self._sample_rate = sample_rate or resolved.stt_sample_rate
        self._http = http_client
        self._owns_http = http_client is None
        #: Flipped after a socket refuses to open, so the next turn does not
        #: pay the connect timeout again before falling back.
        self._ws_unavailable = False

    @property
    def model(self) -> str:
        return self._model

    @property
    def streaming_enabled(self) -> bool:
        return self._streaming

    @property
    def stt_sample_rate(self) -> int:
        return self._sample_rate

    def _session(self, timeout: float) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=timeout)
        return self._http

    # -- streaming -------------------------------------------------------
    def stream(
        self,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.SpeechStream:
        if not self._streaming:
            raise NotImplementedError(
                "SarvamSTT was built with streaming off (SARVAM_STREAMING=0); "
                "AgentSession should be using the VAD stream adapter instead."
            )
        return _SarvamSpeechStream(
            sarvam=self,
            conn_options=conn_options,
            language=language if isinstance(language, str) else self._language,
        )

    def ws_url_for(self, language: str) -> str:
        return sarvam_ws.stt_ws_url(
            self._ws_url,
            model=self._model,
            language=language,
            sample_rate=self._sample_rate,
            mode=self._mode,
        )

    # -- REST ------------------------------------------------------------
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


class _SarvamSpeechStream(stt.SpeechStream):
    """One utterance stream over the Saaras socket.

    The base class resamples incoming frames to `sample_rate` for us, retries
    `_run` on any `APIError`, and closes the event channel when it returns.
    """

    def __init__(
        self,
        *,
        sarvam: SarvamSTT,
        conn_options: APIConnectOptions,
        language: str,
    ) -> None:
        super().__init__(
            stt=sarvam, conn_options=conn_options, sample_rate=sarvam.stt_sample_rate
        )
        self._sarvam = sarvam
        self._language = language
        self._encoding = sarvam_ws.DEFAULT_AUDIO_ENCODING
        self._chunk_bytes = 2 * sarvam_ws.stt_chunk_samples(sarvam.stt_sample_rate)
        self._decoder = sarvam_ws.SarvamSTTDecoder()
        self._eos_task: asyncio.Task[None] | None = None

    async def _run(self) -> None:
        if not self._sarvam._api_key:
            raise ValueError("SARVAM_API_KEY is not set; SarvamSTT cannot authenticate.")

        # Re-entrant: the base class may call `_run` again after an APIError.
        self._decoder = sarvam_ws.SarvamSTTDecoder()

        if self._sarvam._ws_unavailable:
            await self._run_rest_fallback("the socket was already known to be unreachable")
            return

        session = aiohttp.ClientSession()
        try:
            try:
                ws = await asyncio.wait_for(
                    session.ws_connect(
                        self._sarvam.ws_url_for(self._language),
                        headers={"api-subscription-key": self._sarvam._api_key},
                    ),
                    self._conn_options.timeout,
                )
            except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as exc:
                # Degrade rather than drop the call: an elder mid-booking does
                # not care which transport carried their sentence.
                self._sarvam._ws_unavailable = True
                await self._run_rest_fallback(f"could not open the Saaras socket: {exc}")
                return

            try:
                await self._pump(ws)
            finally:
                await self._cancel_eos_fallback()
                if not ws.closed:
                    await ws.close()
        finally:
            await session.close()

    # -- socket ----------------------------------------------------------
    async def _pump(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        send = asyncio.create_task(self._send_audio(ws))
        recv = asyncio.create_task(self._read_messages(ws))
        try:
            done, pending = await asyncio.wait(
                [send, recv], return_when=asyncio.FIRST_EXCEPTION
            )
            for task in done:
                exc = task.exception()
                if exc is not None:
                    raise exc
            # The sender finishing means end_of_stream went out; give the
            # server its moment to answer with the last transcript.
            if recv in pending:
                await asyncio.wait([recv], timeout=self._conn_options.timeout)
                # A server-side error that arrives in that window is still an
                # error; without this it would be cancelled away unread.
                if recv.done():
                    exc = recv.exception()
                    if exc is not None:
                        raise exc
                else:
                    # The socket went quiet holding our last transcript. Say
                    # so, rather than cancelling it into silence.
                    raise APITimeoutError(
                        "Sarvam STT did not answer after the audio stream ended"
                    )
        finally:
            await utils.aio.cancel_and_wait(send, recv)

    async def _send_audio(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        buffer = bytearray()
        try:
            async for frame in self._input_ch:
                if isinstance(frame, rtc.AudioFrame):
                    buffer.extend(frame.data.tobytes())
                    while len(buffer) >= self._chunk_bytes:
                        chunk = bytes(buffer[: self._chunk_bytes])
                        del buffer[: self._chunk_bytes]
                        await ws.send_str(
                            sarvam_ws.stt_audio_frame(
                                chunk,
                                encoding=self._encoding,
                                sample_rate=self._sarvam.stt_sample_rate,
                            )
                        )
                elif isinstance(frame, self._FlushSentinel):
                    if buffer:
                        await ws.send_str(
                            sarvam_ws.stt_audio_frame(
                                bytes(buffer),
                                encoding=self._encoding,
                                sample_rate=self._sarvam.stt_sample_rate,
                            )
                        )
                        buffer.clear()
                    await ws.send_str(sarvam_ws.stt_flush_frame())

                # Sarvam's own VAD asks for the flush; it is sent from here so
                # that one task owns the socket writer.
                if self._decoder.take_flush():
                    await ws.send_str(sarvam_ws.stt_flush_frame())

            await ws.send_str(
                sarvam_ws.stt_end_of_stream_frame(
                    encoding=self._encoding, sample_rate=self._sarvam.stt_sample_rate
                )
            )
        except (aiohttp.ClientError, ConnectionResetError) as exc:
            raise APIConnectionError(f"Sarvam STT send failed: {exc}") from exc

    async def _read_messages(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        async for message in ws:
            if message.type == aiohttp.WSMsgType.TEXT:
                try:
                    events = self._decoder.feed(message.data)
                except ValueError:
                    logger.warning("undecodable Saaras frame dropped: %.200s", message.data)
                    continue
                for event in events:
                    self._emit(event)
                if self._decoder.pending_end_of_speech:
                    self._arm_eos_fallback()
            elif message.type == aiohttp.WSMsgType.ERROR:
                raise APIConnectionError(f"Sarvam STT socket error: {ws.exception()}")
            elif message.type in (
                aiohttp.WSMsgType.CLOSE,
                aiohttp.WSMsgType.CLOSED,
                aiohttp.WSMsgType.CLOSING,
            ):
                break
        for event in self._decoder.force_end_of_speech():
            self._emit(event)

    # -- events ----------------------------------------------------------
    def _emit(self, event: sarvam_ws.STTEvent) -> None:
        if event.kind == "error":
            raise APIStatusError(
                message=f"Sarvam STT error: {event.message}",
                status_code=event.status_code if event.status_code is not None else -1,
                body=event.message,
            )
        if event.kind == "usage":
            self._event_ch.send_nowait(
                stt.SpeechEvent(
                    type=stt.SpeechEventType.RECOGNITION_USAGE,
                    request_id=event.request_id,
                    recognition_usage=stt.RecognitionUsage(audio_duration=event.audio_duration),
                )
            )
            return

        types = {
            "start_of_speech": stt.SpeechEventType.START_OF_SPEECH,
            "interim": stt.SpeechEventType.INTERIM_TRANSCRIPT,
            "final": stt.SpeechEventType.FINAL_TRANSCRIPT,
            "end_of_speech": stt.SpeechEventType.END_OF_SPEECH,
        }
        speech_event = stt.SpeechEvent(type=types[event.kind], request_id=event.request_id)
        if event.kind in ("interim", "final"):
            speech_event.alternatives = [
                stt.SpeechData(language=event.language or self._language, text=event.text)
            ]
        self._event_ch.send_nowait(speech_event)

    def _arm_eos_fallback(self) -> None:
        if self._eos_task is not None and not self._eos_task.done():
            return
        self._eos_task = asyncio.create_task(self._release_eos_later())

    async def _release_eos_later(self) -> None:
        await asyncio.sleep(EOS_FALLBACK_S)
        for event in self._decoder.force_end_of_speech():
            logger.debug("releasing a held END_OF_SPEECH: no transcript in %.1fs", EOS_FALLBACK_S)
            self._emit(event)

    async def _cancel_eos_fallback(self) -> None:
        if self._eos_task is not None:
            await utils.aio.cancel_and_wait(self._eos_task)
            self._eos_task = None

    # -- degraded path ---------------------------------------------------
    async def _run_rest_fallback(self, why: str) -> None:
        """Buffer the utterance and transcribe it in one REST call.

        Slower by exactly the upload it re-introduces, which is the cost of
        the call continuing at all.
        """
        logger.warning("Saaras streaming unavailable, using REST for this turn: %s", why)
        frames: list[rtc.AudioFrame] = []
        started = False

        async for frame in self._input_ch:
            if isinstance(frame, rtc.AudioFrame):
                if not started:
                    started = True
                    self._event_ch.send_nowait(
                        stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH)
                    )
                frames.append(frame)
                continue
            if isinstance(frame, self._FlushSentinel) and frames:
                await self._recognize_buffered(frames)
                frames = []
                started = False

        if frames:
            await self._recognize_buffered(frames)

    async def _recognize_buffered(self, frames: list[rtc.AudioFrame]) -> None:
        event = await self._sarvam._recognize_impl(
            frames, language=self._language, conn_options=self._conn_options
        )
        self._event_ch.send_nowait(event)
        self._event_ch.send_nowait(
            stt.SpeechEvent(type=stt.SpeechEventType.END_OF_SPEECH, request_id=event.request_id)
        )
