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

Run it:

    python -m saathi_agent.voice.worker dev      # local, hot reload
    python -m saathi_agent.voice.worker start    # production
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Callable

try:
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
from ..prompts import ElderContext, build_system_prompt, greeting_copy
from .config import (
    MAX_ENDPOINTING_DELAY,
    MIN_ENDPOINTING_DELAY,
    MIN_INTERRUPTION_DURATION,
    MIN_INTERRUPTION_WORDS,
    SILENCE_TIMEOUT_S,
    SarvamSettings,
    elder_context_from_metadata,
)
from .lock import playback_policy, should_discard_user_turn
from .sarvam_stt import SarvamSTT
from .sarvam_tts import SarvamTTS

logger = logging.getLogger("saathi.voice")


class SaathiVoiceAgent(Agent):
    """The LiveKit-side shell. Every decision it makes is about audio."""

    def __init__(self, core: VoiceSession, *, on_closed: Callable[[], None] | None = None) -> None:
        # The framework requires instructions even when it never calls an LLM;
        # passing the real prompt keeps the transcript readable in LiveKit's
        # session inspector.
        super().__init__(instructions=build_system_prompt(core.context), tools=[])
        self._core = core
        self._on_closed = on_closed
        self._turn_lock = asyncio.Lock()
        self._readback_playing = False

    # -- lifecycle -------------------------------------------------------
    async def on_enter(self) -> None:
        self.session.say(greeting_copy(self._core.context.language), allow_interruptions=True)

    # -- turns -----------------------------------------------------------
    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        text = (new_message.text_content or "").strip()

        if should_discard_user_turn(
            locked_playback_active=self._readback_playing, transcript=text
        ):
            logger.info("dropped %r: spoken over a locked readback", text)
            raise StopResponse()

        if not text:
            raise StopResponse()

        async with self._turn_lock:
            turn = await asyncio.to_thread(self._core.user_says, text)
            await self._speak(turn)
        raise StopResponse()

    async def on_silence(self) -> None:
        """No speech for the endpointing window: one re-prompt, then close."""
        if self._turn_lock.locked():
            return
        async with self._turn_lock:
            turn = await asyncio.to_thread(self._core.on_silence)
            await self._speak(turn)

    # -- speaking --------------------------------------------------------
    async def _speak(self, turn: AgentTurn) -> None:
        if not turn.reply:
            return

        policy = playback_policy(
            state=turn.state, handed_off=turn.handed_off, closed=turn.closed
        )
        logger.debug("saying (%s): %s", policy.reason, turn.reply)

        self._readback_playing = policy.locked
        handle = self.session.say(turn.reply, allow_interruptions=policy.allow_interruptions)
        try:
            await handle.wait_for_playout()
        finally:
            self._readback_playing = False

        if turn.closed and self._on_closed is not None:
            self._on_closed()


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
        "call joined room=%s language=%s session=%s",
        ctx.room.name,
        context.language,
        core.session_id,
    )

    session: AgentSession = AgentSession(
        stt=SarvamSTT(settings=settings),
        tts=SarvamTTS(settings=settings, language=context.language),
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
                # A "haan haan" over a locked readback is dropped rather than
                # buffered into the next turn, where it could read as consent.
                discard_audio_if_uninterruptible=True,
                min_duration=MIN_INTERRUPTION_DURATION,
                min_words=MIN_INTERRUPTION_WORDS,
            ),
        ),
        user_away_timeout=SILENCE_TIMEOUT_S,
    )

    agent = SaathiVoiceAgent(core, on_closed=lambda: ctx.shutdown(reason="polite_close"))

    @session.on("user_state_changed")
    def _on_user_state(event: object) -> None:
        # "away" is the framework's name for the silence window elapsing; the
        # core counts them and closes the call on the second one.
        if getattr(event, "new_state", None) != "away":
            return
        asyncio.create_task(agent.on_silence())

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
