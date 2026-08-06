"""Week-2 scaffold: import guards, the readback lock, the voice config.

Two jobs here.

First, prove the audio layer cannot break the text suite. The base install has
no LiveKit and the week-1 tests must keep running that way, so `import
saathi_agent` may not reach it even transitively, and the three modules that
genuinely need it must fail with an instruction rather than a traceback.

Second, test the readback interruption lock without an audio stack. It is the
decision standing between a stray "haan haan" over a price being read and an
irreversible booking, which makes it exactly the wrong thing to be reachable
only from a live room.
"""

from __future__ import annotations

import importlib
import importlib.util
import subprocess
import sys

import pytest

from conftest import make_session
from saathi_agent import ElderContext, FamilyMember, State
from saathi_agent.voice import config, lock

SHARMA_SEARCH = {
    "name": "search_vendors",
    "arguments": {"category": "doctor", "query": "শর্মা"},
}
SHARMA_SLOTS = {
    "name": "search_slots",
    "arguments": {"vendor_id": "vnd_dr_sharma", "date_range": "2026-08-11..2026-08-16"},
}
HOLD_THU = {"name": "hold_slot", "arguments": {"slot_id": "slot_sharma_thu_1600"}}
CONFIRM = {"name": "confirm_booking", "arguments": {"hold_id": "{{hold_id}}"}}

#: The modules that legitimately need `pip install -e ".[voice]"`.
GUARDED_MODULES = (
    "saathi_agent.voice.sarvam_stt",
    "saathi_agent.voice.sarvam_tts",
    "saathi_agent.voice.worker",
)


def _livekit_installed() -> bool:
    try:
        return importlib.util.find_spec("livekit.agents") is not None
    except (ImportError, ValueError):
        return False


LIVEKIT_INSTALLED = _livekit_installed()


# --------------------------------------------------------------------------
# Import guards
# --------------------------------------------------------------------------


def test_text_package_never_imports_livekit() -> None:
    """A fresh interpreter importing the week-1 package pulls in no audio.

    Checked in a subprocess because this one only means anything before
    anything else in the session has imported the voice package.
    """
    probe = (
        "import sys; import saathi_agent; "
        "print(any(m == 'livekit' or m.startswith('livekit.') for m in sys.modules)); "
        "print('saathi_agent.voice' in sys.modules)"
    )
    result = subprocess.run(
        [sys.executable, "-c", probe], capture_output=True, text=True, check=True
    )
    assert result.stdout.split() == ["False", "False"]


def test_voice_package_imports_without_the_extra() -> None:
    """`import saathi_agent.voice` is safe with no LiveKit on the machine."""
    assert lock.interruption_locked(State.READBACK_CONFIRM) is True
    assert config.MIN_ENDPOINTING_DELAY == 0.7
    for module in GUARDED_MODULES:
        assert module not in sys.modules, f"{module} was imported as a side effect"


def test_unknown_voice_attribute_still_raises_attributeerror() -> None:
    import saathi_agent.voice as voice

    with pytest.raises(AttributeError):
        voice.no_such_thing


@pytest.mark.skipif(LIVEKIT_INSTALLED, reason="livekit-agents is installed")
@pytest.mark.parametrize("module", GUARDED_MODULES)
def test_guarded_modules_name_the_extra(module: str) -> None:
    """Without the extra, the failure has to tell you what to install."""
    with pytest.raises(ImportError) as exc:
        importlib.import_module(module)
    assert "[voice]" in str(exc.value)


@pytest.mark.skipif(not LIVEKIT_INSTALLED, reason="needs the voice extra")
def test_adapters_implement_the_livekit_base_classes() -> None:
    stt = pytest.importorskip("livekit.agents.stt")
    tts = pytest.importorskip("livekit.agents.tts")
    from saathi_agent.voice.sarvam_stt import SarvamSTT
    from saathi_agent.voice.sarvam_tts import SarvamTTS

    assert issubclass(SarvamSTT, stt.STT)
    assert issubclass(SarvamTTS, tts.TTS)

    speech_to_text = SarvamSTT(api_key="test-key")
    assert speech_to_text.model == config.DEFAULT_SAARAS_MODEL
    assert speech_to_text.capabilities.streaming is False  # VAD adapter supplies the stream

    text_to_speech = SarvamTTS(api_key="test-key", language="bn")
    assert text_to_speech.sample_rate == config.DEFAULT_TTS_SAMPLE_RATE
    assert text_to_speech.num_channels == 1
    assert text_to_speech._payload("হ্যালো")["target_language_code"] == "bn-IN"


# --------------------------------------------------------------------------
# The readback interruption lock
# --------------------------------------------------------------------------


@pytest.mark.parametrize("state", list(State))
def test_only_the_readback_locks_interruptions(state: State) -> None:
    expected = state is State.READBACK_CONFIRM
    assert lock.interruption_locked(state) is expected
    assert lock.playback_policy(state=state).locked is expected


def test_handoff_and_close_are_never_locked() -> None:
    """A human joining, or the call ending, must always be interruptible -
    even on the turn that was mid-readback."""
    assert lock.interruption_locked(State.READBACK_CONFIRM, handed_off=True) is False
    assert lock.interruption_locked(State.READBACK_CONFIRM, closed=True) is False
    assert lock.playback_policy(state=State.HANDOFF, handed_off=True).allow_interruptions is True


def test_policy_carries_a_reason() -> None:
    assert "readback" in lock.playback_policy(state=State.READBACK_CONFIRM).reason
    assert lock.playback_policy(state=State.SLOT_FILL).reason


@pytest.mark.parametrize(
    ("locked", "transcript", "discarded"),
    [
        (False, "হ্যাঁ", False),  # not a readback: every word counts
        (True, "হ্যাঁ হ্যাঁ", True),  # talked over the price; not consent
        (True, "haan haan", True),
        (True, "", True),
        (True, "আমার বুকে ব্যথা হচ্ছে", False),  # distress always gets through
        (True, "chest pain", False),
        (False, "chest pain", False),
    ],
)
def test_barge_in_during_a_locked_readback_is_dropped_except_distress(
    locked: bool, transcript: str, discarded: bool
) -> None:
    assert (
        lock.should_discard_user_turn(locked_playback_active=locked, transcript=transcript)
        is discarded
    )


def test_lock_follows_a_real_booking_through_the_machine(client, context) -> None:
    """The pure function against the states an actual session walks: the hold
    turn locks, the confirm turn does not."""
    session = make_session(
        client,
        [
            [{"tool_calls": [SHARMA_SEARCH]}, {"tool_calls": [SHARMA_SLOTS]}, {"content": "কোন দিন?"}],
            [{"tool_calls": [HOLD_THU]}, {"content": "ডাঃ শর্মা, বৃহস্পতিবার ৪টা, ৩০০ টাকা। ঠিক আছে?"}],
            [{"tool_calls": [CONFIRM]}, {"content": "হয়ে গেছে।"}],
        ],
        context,
    )

    def policy_for(turn):
        return lock.playback_policy(
            state=turn.state, handed_off=turn.handed_off, closed=turn.closed
        )

    assert policy_for(session.user_says("ডাঃ শর্মার অ্যাপয়েন্টমেন্ট")).locked is False
    readback = session.user_says("বৃহস্পতিবার বিকেল চারটে")
    assert readback.state is State.READBACK_CONFIRM
    assert policy_for(readback).locked is True
    receipt = session.user_says("ঠিক আছে")
    assert receipt.state is State.RECEIPT
    assert policy_for(receipt).locked is False


def test_distress_mid_readback_unlocks_the_next_utterance(client, context) -> None:
    session = make_session(
        client,
        [
            [{"tool_calls": [SHARMA_SEARCH]}, {"tool_calls": [SHARMA_SLOTS]}, {"content": "কোন দিন?"}],
            [{"tool_calls": [HOLD_THU]}, {"content": "৩০০ টাকা। ঠিক আছে?"}],
            [],
        ],
        context,
    )
    session.user_says("ডাঃ শর্মার অ্যাপয়েন্টমেন্ট")
    session.user_says("বৃহস্পতিবার বিকেল চারটে")

    distress = "আমার বুকে ব্যথা"
    assert lock.should_discard_user_turn(locked_playback_active=True, transcript=distress) is False
    turn = session.user_says(distress)
    assert turn.handed_off is True
    assert lock.playback_policy(state=turn.state, handed_off=True).allow_interruptions is True


# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------


def test_elder_tuning_matches_the_build_guide() -> None:
    assert config.MIN_ENDPOINTING_DELAY == 0.7  # D.4: 600-900ms, not the ~300ms default
    assert config.MAX_ENDPOINTING_DELAY > config.MIN_ENDPOINTING_DELAY
    assert 8.0 <= config.SILENCE_TIMEOUT_S <= 10.0  # D.4: one re-prompt at 8-10s


@pytest.mark.parametrize(
    ("language", "expected"),
    [("bn", "bn-IN"), ("hi", "hi-IN"), ("en", "en-IN"), ("xx", "en-IN")],
)
def test_language_maps_to_sarvam_codes(language: str, expected: str) -> None:
    assert config.sarvam_language(language) == expected


def test_settings_read_the_documented_env_vars(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SARVAM_API_KEY", "sk-test")
    monkeypatch.setenv("SAARAS_MODEL", "saaras:v3")
    monkeypatch.setenv("BULBUL_VOICE", "manisha")
    monkeypatch.setenv("SARVAM_TTS_SAMPLE_RATE", "8000")

    settings = config.SarvamSettings.from_env()
    assert settings.require_api_key() == "sk-test"
    assert settings.stt_model == "saaras:v3"
    assert settings.tts_voice == "manisha"
    assert settings.tts_sample_rate == 8000


def test_settings_default_and_refuse_to_run_keyless(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("SARVAM_API_KEY", "SAARAS_MODEL", "BULBUL_MODEL", "BULBUL_VOICE"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("SARVAM_TTS_SAMPLE_RATE", "not-a-number")

    settings = config.SarvamSettings.from_env()
    assert settings.stt_model == "saaras:v3"
    assert settings.stt_language == "unknown"  # code-switched Benglish, auto-detected
    assert settings.tts_sample_rate == config.DEFAULT_TTS_SAMPLE_RATE
    with pytest.raises(ValueError, match="SARVAM_API_KEY"):
        settings.require_api_key()


def test_job_metadata_becomes_an_elder_context() -> None:
    context = config.elder_context_from_metadata(
        '{"elder_name": "অমিয় কাকু", "language": "bn", "city": "Siliguri",'
        ' "family_members": [{"id": "fam_riya", "name": "Riya", "relation": "daughter"}]}'
    )
    assert context.elder_name == "অমিয় কাকু"
    assert context.family_members == [
        FamilyMember(id="fam_riya", name="Riya", relation="daughter")
    ]


@pytest.mark.parametrize("raw", [None, "", "   ", "not json", "[1, 2]", '{"language": "klingon"}'])
def test_bad_metadata_degrades_instead_of_killing_the_call(raw: str | None) -> None:
    """A call that starts in the wrong language is recoverable; a worker that
    crashes on join is not."""
    assert config.elder_context_from_metadata(raw) == ElderContext()


def test_malformed_family_members_are_skipped_not_fatal() -> None:
    context = config.elder_context_from_metadata(
        '{"family_members": [{"id": "fam_ok", "name": "Riya", "relation": "daughter"},'
        ' {"id": "fam_broken"}, "nonsense"]}'
    )
    assert [m.id for m in context.family_members] == ["fam_ok"]
