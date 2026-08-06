"""LiveKit Agents worker: the audio loop wrapped around the week-1 brain.

    room audio -> Saaras STT -> VoiceSession.user_says -> Bulbul TTS -> room

The brain is untouched. `VoiceSession` is synchronous by design (week 1
deviation note), so every call into it goes through `asyncio.to_thread`: the
event loop keeps servicing audio while the tool loop blocks on the booking
API. Nothing in `saathi_agent/` outside this package knows LiveKit exists.

Why the LLM is not wired into `AgentSession`: the session owns STT, TTS and
VAD only. The reply for every turn comes from `VoiceSession`, which runs its
own model call, its own tool loop, and - the part that matters - its own state
gate. Handing the tools to the framework's LLM node would move the
`confirm_booking` gate back into the model's reach, which is the one thing
D.2 says never to do. So `on_user_turn_completed` does the work and raises
`StopResponse` to stop the framework generating a second, ungated reply.

Week 3 adds the latency layer, all of it around the edges of that loop and
none of it inside the gate: Sarvam's sockets (`SARVAM_STREAMING`), a disk
cache of the fixed frames, and a per-turn latency record.

Run it:

    python -m saathi_agent.voice.worker dev      # local, hot reload
    python -m saathi_agent.voice.worker start    # production
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import AsyncIterator, Callable

try:
    from livekit import rtc
    from livekit.agents import (
        Agent,
        AgentSession,
        EndpointingOptions,
        InterruptionOptions,
        JobContext,
        JobProcess,
        RoomInputOptions,
        StopResponse,
        TurnHandlingOptions,
        WorkerOptions,
        cli,
        llm,
    )
    from livekit.plugins import silero
except ImportError as exc:  # pragma: no cover - exercised by the extras guard test
    raise ImportError(
        "saathi_agent.voice.worker needs the voice extra: "
        'pip install -e ".[voice]"'
    ) from exc

from ..agent import AgentTurn, OpenAIChatClient, VoiceSession
from ..booking_client import BookingClient, HttpBookingClient, MockBookingClient
from ..prompts import ElderContext, build_system_prompt, error_apology, greeting_copy
from .cache import CachedAudio, TTSFrameCache
from .config import (
    DISCARD_AUDIO_IF_UNINTERRUPTIBLE,
    MAX_ENDPOINTING_DELAY,
    MIN_ENDPOINTING_DELAY,
    MIN_INTERRUPTION_DURATION,
    MIN_INTERRUPTION_WORDS,
    SILENCE_TIMEOUT_S,
    SarvamSettings,
    elder_context_from_metadata,
)
from .lock import ReadbackGate, playback_policy
from .metrics import MetricsRecorder, TurnClock
from .sarvam_stt import SarvamSTT
from .sarvam_tts import SarvamTTS

logger = logging.getLogger("saathi.voice")

#: Cached audio is handed to the room in 10ms frames, the same cadence the
#: TTS emitter uses. Larger frames arrive in visible steps at the start of a
#: sentence, which is exactly where the cache is supposed to be invisible.
CACHE_FRAME_MS = 10


async def cached_audio_frames(audio: CachedAudio) -> AsyncIterator[rtc.AudioFrame]:
    """Pre-synthesized PCM as room frames."""
    samples_per_frame = max(int(audio.sample_rate * CACHE_FRAME_MS / 1000), 1)
    stride = samples_per_frame * 2 * audio.num_channels
    for offset in range(0, len(audio.pcm), stride):
        chunk = audio.pcm[offset : offset + stride]
        if len(chunk) < stride:
            # A partial trailing frame is padded rather than dropped: the last
            # few milliseconds of a word are the ones that make it a word.
            chunk = chunk + bytes(stride - len(chunk))
        yield rtc.AudioFrame(
            data=chunk,
            sample_rate=audio.sample_rate,
            num_channels=audio.num_channels,
            samples_per_channel=samples_per_frame,
        )


class SaathiVoiceAgent(Agent):
    """The LiveKit-side shell. Every decision it makes is about audio."""

    def __init__(
        self,
        core: VoiceSession,
        *,
        on_closed: Callable[[], None] | None = None,
        tts: SarvamTTS | None = None,
        frame_cache: TTSFrameCache | None = None,
        recorder: MetricsRecorder | None = None,
        streaming: bool = True,
    ) -> None:
        # The framework requires instructions even when it never calls an LLM;
        # passing the real prompt keeps the transcript readable in LiveKit's
        # session inspector.
        super().__init__(instructions=build_system_prompt(core.context), tools=[])
        self._core = core
        self._on_closed = on_closed
        self._tts = tts
        self._cache = frame_cache
        self._recorder = recorder
        self._streaming = streaming
        self._turn_lock = asyncio.Lock()
        self._readback = ReadbackGate()
        self._turns = 0
        self._clock: TurnClock | None = None
        #: Set by the framework's user_state_changed handler; the closest
        #: thing to "the elder stopped talking" the session exposes.
        self._speech_ended_at: float | None = None

    # -- lifecycle -------------------------------------------------------
    async def on_enter(self) -> None:
        # The greeting is the most valuable cache hit on the call: it is
        # spoken while nothing else is warm.
        clock = self._new_clock()
        clock.stamp("user_speech_end")
        clock.stamp("stt_final")
        clock.stamp("llm_done")
        await self._say(
            greeting_copy(self._core.context.language), allow_interruptions=True, clock=clock
        )

    # -- turns -----------------------------------------------------------
    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        text = (new_message.text_content or "").strip()

        # Snapshot before the check: whatever the answer is now, the same epoch
        # is re-tested under the lock, where the readback may have finished in
        # the meantime.
        epoch = self._readback.epoch
        if self._readback.should_discard(transcript=text, epoch=epoch):
            logger.info("dropped %r: spoken over a locked readback", text)
            raise StopResponse()

        if not text:
            raise StopResponse()

        clock = self._new_clock()
        clock.stamp("user_speech_end", at=self._speech_ended_at)
        clock.stamp("stt_final")
        self._speech_ended_at = None

        async with self._turn_lock:
            # The wait for this lock is exactly the window the pre-lock check
            # cannot see: a readback finishing here makes the transcript older
            # than the question it would be answering.
            if self._readback.should_discard(transcript=text, epoch=epoch):
                logger.info("dropped %r: queued before the readback finished", text)
                raise StopResponse()
            try:
                turn = await asyncio.to_thread(self._core.user_says, text)
            except Exception:
                # Dead air is the worst failure mode on a call with someone
                # who cannot see a spinner. The apology promises nothing about
                # whether the booking went through, because we do not know.
                logger.exception("the turn raised; apologising instead of going silent")
                clock.stamp("llm_done")
                await self._say(
                    error_apology(self._core.context.language),
                    allow_interruptions=True,
                    clock=clock,
                )
                raise StopResponse()
            clock.stamp("llm_done")
            await self._speak(turn, clock)
        raise StopResponse()

    async def on_silence(self) -> None:
        """No speech for the endpointing window: one re-prompt, then close."""
        if self._turn_lock.locked():
            return
        async with self._turn_lock:
            clock = self._new_clock()
            clock.stamp("user_speech_end")
            clock.stamp("stt_final")
            turn = await asyncio.to_thread(self._core.on_silence)
            clock.stamp("llm_done")
            await self._speak(turn, clock)

    # -- session events --------------------------------------------------
    def note_user_speech_end(self) -> None:
        self._speech_ended_at = time.monotonic()

    def note_playback_start(self) -> None:
        if self._clock is not None:
            self._clock.stamp("playback_start")

    # -- speaking --------------------------------------------------------
    async def _speak(self, turn: AgentTurn, clock: TurnClock) -> None:
        if not turn.reply:
            return

        policy = playback_policy(
            state=turn.state, handed_off=turn.handed_off, closed=turn.closed
        )
        logger.debug("saying (%s): %s", policy.reason, turn.reply)

        if policy.locked:
            self._readback.begin()
        try:
            await self._say(
                turn.reply, allow_interruptions=policy.allow_interruptions, clock=clock
            )
        finally:
            self._readback.end()

        if turn.closed and self._on_closed is not None:
            self._on_closed()

    async def _say(self, text: str, *, allow_interruptions: bool, clock: TurnClock) -> None:
        """One utterance: from the cache if it is a fixed frame, else synthesized."""
        self._clock = clock
        cached = self._cache.load(text, language=self._core.context.language) if self._cache else None

        if cached is not None:
            clock.cache_hit = True
            clock.stamp("tts_first_chunk")
            handle = self.session.say(
                text,
                audio=cached_audio_frames(cached),
                allow_interruptions=allow_interruptions,
            )
        else:
            if self._tts is not None:
                self._tts.first_chunk_hook = lambda: clock.stamp("tts_first_chunk")
            handle = self.session.say(text, allow_interruptions=allow_interruptions)

        try:
            await handle.wait_for_playout()
        finally:
            clock.stamp("playback_end")
            if self._tts is not None:
                self._tts.first_chunk_hook = None
            self._clock = None
            if self._recorder is not None:
                self._recorder.write(clock)

    def _new_clock(self) -> TurnClock:
        self._turns += 1
        return TurnClock(
            session_id=self._core.session_id, turn=self._turns, streaming=self._streaming
        )


# --------------------------------------------------------------------------
# Wiring
# --------------------------------------------------------------------------


def build_booking_client() -> BookingClient:
    """Real API when `SAATHI_API_BASE_URL` is set, mock otherwise.

    The mock is a development convenience and says so loudly: a worker
    answering real calls against `MockBookingClient` would confirm bookings
    that no vendor ever hears about, which is exactly the false-confirm metric
    D.8 alerts on.
    """
    if os.environ.get("SAATHI_API_BASE_URL"):
        return HttpBookingClient()
    logger.warning(
        "SAATHI_API_BASE_URL is not set - falling back to MockBookingClient. "
        "Bookings made on this worker are not real."
    )
    return MockBookingClient()


def build_core(context: ElderContext, *, session_id: str | None = None) -> VoiceSession:
    return VoiceSession(
        build_booking_client(),
        OpenAIChatClient(),
        context,
        session_id=session_id,
    )


def build_frame_cache(settings: SarvamSettings) -> TTSFrameCache | None:
    """The warmed cache, or None if nothing has been warmed for this voice.

    An empty cache is not an error - it is a deploy step nobody ran - so the
    worker says so once and synthesizes everything, rather than refusing to
    take calls.
    """
    cache = TTSFrameCache(settings=settings)
    if not cache.entries():
        logger.warning(
            "no pre-synthesized frames for voice %r in %s; run "
            "`python -m saathi_agent.voice.cache warm` to cut the greeting latency",
            cache.voice,
            cache.directory,
        )
        return None
    return cache


def prewarm(proc: JobProcess) -> None:
    """Load the VAD once per worker process, not once per call."""
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    context = elder_context_from_metadata(ctx.job.metadata)
    settings = SarvamSettings.from_env()
    settings.require_api_key()

    core = build_core(context, session_id=f"lk_{ctx.room.name}")
    logger.info(
        "call joined room=%s language=%s session=%s streaming=%s",
        ctx.room.name,
        context.language,
        core.session_id,
        settings.streaming,
    )

    tts = SarvamTTS(settings=settings, language=context.language)
    session: AgentSession = AgentSession(
        stt=SarvamSTT(settings=settings),
        tts=tts,
        vad=ctx.proc.userdata.get("vad") or silero.VAD.load(),
        # Elder tuning, BUILD_GUIDE D.4. Barge-in stays on for the whole call;
        # the readback turns it off for one utterance (see lock.py). The flat
        # `min_endpointing_delay=` kwargs do the same thing but are deprecated
        # as of livekit-agents 1.6 and gone in 2.0.
        turn_handling=TurnHandlingOptions(
            endpointing=EndpointingOptions(
                min_delay=MIN_ENDPOINTING_DELAY,
                max_delay=MAX_ENDPOINTING_DELAY,
            ),
            interruption=InterruptionOptions(
                enabled=True,
                # Off: discarding the audio would also discard the elder
                # reporting chest pain over the readback, which is the one
                # thing that must get through. Everything spoken over a locked
                # readback is transcribed and then dropped as text by
                # `ReadbackGate`, where distress can be recognised first.
                discard_audio_if_uninterruptible=DISCARD_AUDIO_IF_UNINTERRUPTIBLE,
                min_duration=MIN_INTERRUPTION_DURATION,
                min_words=MIN_INTERRUPTION_WORDS,
            ),
        ),
        user_away_timeout=SILENCE_TIMEOUT_S,
    )

    agent = SaathiVoiceAgent(
        core,
        on_closed=lambda: ctx.shutdown(reason="polite_close"),
        tts=tts,
        frame_cache=build_frame_cache(settings),
        recorder=MetricsRecorder(core.session_id),
        streaming=settings.streaming,
    )

    @session.on("user_state_changed")
    def _on_user_state(event: object) -> None:
        new_state = getattr(event, "new_state", None)
        if new_state == "listening" and getattr(event, "old_state", None) == "speaking":
            # The elder stopped talking. Everything after this is our latency.
            agent.note_user_speech_end()
            return
        # "away" is the framework's name for the silence window elapsing; the
        # core counts them and closes the call on the second one.
        if new_state == "away":
            asyncio.create_task(agent.on_silence())

    @session.on("agent_state_changed")
    def _on_agent_state(event: object) -> None:
        if getattr(event, "new_state", None) == "speaking":
            agent.note_playback_start()

    async def _flush_audit() -> None:
        core.close(reason="room_disconnected")
        try:
            core.dump_audit()
        except OSError:
            logger.exception("could not write the audit trace for %s", core.session_id)

    ctx.add_shutdown_callback(_flush_audit)

    await session.start(agent=agent, room=ctx.room, room_input_options=RoomInputOptions())


def main() -> None:
    logging.basicConfig(level=os.environ.get("SAATHI_LOG_LEVEL", "INFO"))
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))


if __name__ == "__main__":
    main()
