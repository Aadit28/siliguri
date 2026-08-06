"""The readback interruption lock (BUILD_GUIDE D.3).

Barge-in is on for the whole call except one utterance: the readback. A stray
"haan haan" while the fee is being read must not cut the sentence off, and -
worse - must not be mistaken for the yes that authorises an irreversible
booking. So the rule is two-sided:

    1. while a readback is playing, the elder cannot interrupt it, and
    2. anything transcribed *during* that playback is dropped, because the
       elder cannot have been answering a question they had not finished
       hearing.

Distress is the one thing that gets through rule 2. Someone saying their chest
hurts mid-readback is the case the whole handoff path exists for.

Pure functions on purpose: no LiveKit import, so the decision that gates an
irreversible booking is unit-testable in the base test run.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from ..guards import detect_distress
from ..state import State
from .config import MIN_ENDPOINTING_DELAY

#: The only state whose spoken output is a readback. Reached exclusively by a
#: successful `hold_slot`, which is what makes this safe to key on.
READBACK_STATES: frozenset[State] = frozenset({State.READBACK_CONFIRM})


@dataclass(frozen=True)
class PlaybackPolicy:
    """How one agent utterance may be interrupted, and why."""

    allow_interruptions: bool
    reason: str

    @property
    def locked(self) -> bool:
        return not self.allow_interruptions


def is_readback_state(state: State) -> bool:
    return state in READBACK_STATES


def interruption_locked(
    state: State,
    *,
    handed_off: bool = False,
    closed: bool = False,
) -> bool:
    """Should barge-in be disabled for the utterance this turn produced?

    `state` is the state the machine is in *after* the turn ran, which is the
    state the reply belongs to: a turn that ends in READBACK_CONFIRM is a turn
    whose reply reads the booking back.

    A handoff or a close is never locked. Once a human is joining, or the call
    is ending, the elder talking over the agent is the point.
    """
    if handed_off or closed:
        return False
    return is_readback_state(state)


def playback_policy(
    *,
    state: State,
    handed_off: bool = False,
    closed: bool = False,
) -> PlaybackPolicy:
    """`interruption_locked` plus the reason, for the audit line and the log."""
    if handed_off:
        return PlaybackPolicy(True, "handoff: a human is taking over, never block the elder")
    if closed:
        return PlaybackPolicy(True, "call closing")
    if is_readback_state(state):
        return PlaybackPolicy(False, "readback: the fee and the time must be heard in full")
    return PlaybackPolicy(True, f"normal turn in {state}")


def should_discard_user_turn(*, locked_playback_active: bool, transcript: str) -> bool:
    """Drop a transcript captured while a locked readback was still playing.

    This is the *only* lock on the door. LiveKit's own
    `discard_audio_if_uninterruptible` is deliberately off (it would delete the
    audio before it was ever transcribed, taking the distress carve-out below
    with it), so every word spoken over a readback arrives here as text and is
    judged on what it says.
    """
    if not locked_playback_active:
        return False
    if detect_distress(transcript):
        return False
    return True


#: How long after a locked readback finishes a transcript is still treated as
#: having been spoken *during* it. A genuine reply to the readback cannot be
#: finalised sooner than the endpointing silence that ends it, so this window
#: can only ever catch speech that overlapped the playback.
POST_READBACK_GRACE_S = MIN_ENDPOINTING_DELAY


@dataclass
class ReadbackGate:
    """Playback state for the readback, tracked across the turn lock.

    A boolean flag checked before taking the lock is not enough. A transcript
    finalised in the LLM/TTS gap sees the flag still false, blocks on the lock
    while the readback is spoken, and is then processed *after* it - speech
    that predates the question authorising the booking it answers. The epoch
    makes that visible: a turn holding a stale epoch spoke before the current
    readback finished, whatever the flag said when it arrived.
    """

    grace_s: float = POST_READBACK_GRACE_S
    #: Bumped every time a locked readback finishes playing out.
    epoch: int = 0
    active: bool = False
    ended_at: float | None = None

    def begin(self) -> None:
        self.active = True

    def end(self, *, now: float | None = None) -> None:
        """Playout finished. No-op unless a locked readback was in flight."""
        if not self.active:
            return
        self.active = False
        self.epoch += 1
        self.ended_at = time.monotonic() if now is None else now

    def should_discard(self, *, transcript: str, epoch: int, now: float | None = None) -> bool:
        """Drop this transcript? `epoch` is the value snapshotted when it arrived."""
        if detect_distress(transcript):
            return False  # the one thing that always gets through (rule 2)
        if self.active:
            return True
        if epoch != self.epoch:
            return True  # a readback finished while this turn waited for the lock
        if self.ended_at is None:
            return False
        moment = time.monotonic() if now is None else now
        return moment - self.ended_at < self.grace_s
