"""Week 3: the latency layer, tested with no audio stack and no network.

Three things are worth testing here and they are all things that fail
silently in production:

1. **The Sarvam wire contract.** The frames we send and the frames we decode.
   A partial mistaken for a final is half a sentence answering a readback, and
   an END_OF_SPEECH emitted before its FINAL_TRANSCRIPT closes the turn on an
   empty utterance. Neither raises anything; both just make the agent wrong.
   `sarvam_ws` is pure so this runs in the base install.
2. **The cache key.** A key that is stable when it should not be plays the
   wrong voice; a key that is unstable never hits.
3. **The percentile maths**, because a latency report that is quietly wrong is
   worse than no report - it is a week of tuning the wrong thing.

The sockets are faked. Nothing here opens one, and nothing here needs
`SARVAM_API_KEY`.
"""

from __future__ import annotations

import asyncio
import importlib.util
import io
import json
import wave
from pathlib import Path

import pytest

from saathi_agent import prompts
from saathi_agent.voice import cache, config, metrics, sarvam_ws


def _livekit_installed() -> bool:
    try:
        return importlib.util.find_spec("livekit.agents") is not None
    except (ImportError, ValueError):
        return False


LIVEKIT_INSTALLED = _livekit_installed()


def make_wav(*, sample_rate: int = 22050, channels: int = 1, samples: int = 400) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(b"\x01\x02" * samples * channels)
    return buffer.getvalue()


# ==========================================================================
# The Sarvam WebSocket contract
# ==========================================================================


def test_stt_url_carries_the_documented_parameters() -> None:
    url = sarvam_ws.stt_ws_url(
        config.DEFAULT_STT_WS_URL, model="saaras:v3", language="unknown", sample_rate=16000
    )
    assert url.startswith("wss://api.sarvam.ai/speech-to-text/ws?")
    for expected in (
        "language-code=unknown",
        "model=saaras%3Av3",
        "sample_rate=16000",
        "vad_signals=true",  # the only end-of-utterance marker the socket gives
        "flush_signal=true",
        "mode=transcribe",  # never translate: the booking stays in their words
    ):
        assert expected in url


def test_only_saaras_models_get_a_mode() -> None:
    """Sending `mode` to a saarika model is a 400, which on a live call is a
    turn that never returns a transcript."""
    saarika = sarvam_ws.stt_ws_url(
        config.DEFAULT_STT_WS_URL, model="saarika:v2.5", language="bn-IN", sample_rate=16000
    )
    assert "mode=" not in saarika


def test_audio_frame_is_base64_raw_pcm() -> None:
    frame = json.loads(
        sarvam_ws.stt_audio_frame(b"\x01\x02\x03\x04", encoding="audio/wav", sample_rate=16000)
    )
    assert frame == {
        "audio": {"data": "AQIDBA==", "encoding": "audio/wav", "sample_rate": 16000}
    }


def test_chunk_size_is_fifty_milliseconds() -> None:
    assert sarvam_ws.stt_chunk_samples(16000) == 800
    assert sarvam_ws.stt_chunk_samples(8000) == 400


def _kinds(events: list[sarvam_ws.STTEvent]) -> list[str]:
    return [event.kind for event in events]


def test_a_whole_utterance_decodes_in_order() -> None:
    decoder = sarvam_ws.SarvamSTTDecoder()
    seen: list[str] = []

    seen += _kinds(decoder.feed({"type": "events", "data": {"signal_type": "START_SPEECH"}}))
    seen += _kinds(
        decoder.feed(
            {
                "type": "data",
                "data": {
                    "request_id": "req_1",
                    "transcript": "ডাঃ শর্মার অ্যাপয়েন্টমেন্ট",
                    "language_code": "bn-IN",
                    "metrics": {"audio_duration": 2.5},
                },
            }
        )
    )
    seen += _kinds(decoder.feed({"type": "events", "data": {"signal_type": "END_SPEECH"}}))

    assert seen == ["start_of_speech", "final", "usage", "end_of_speech"]


def test_end_of_speech_is_held_until_its_transcript_arrives() -> None:
    """Sarvam signals END_SPEECH before it sends the transcript it closes.
    Emitting END_OF_SPEECH first would close the turn on an empty utterance -
    the elder speaks and the agent answers nothing."""
    decoder = sarvam_ws.SarvamSTTDecoder()
    decoder.feed({"type": "events", "data": {"signal_type": "START_SPEECH"}})

    assert _kinds(decoder.feed({"type": "events", "data": {"signal_type": "END_SPEECH"}})) == []
    assert decoder.pending_end_of_speech is True

    assert _kinds(decoder.feed({"type": "data", "data": {"transcript": "হ্যাঁ"}})) == [
        "final",
        "end_of_speech",
    ]
    assert decoder.pending_end_of_speech is False


def test_a_held_end_of_speech_can_be_released_once_and_only_once() -> None:
    """The safety valve for a final that never lands: without it the turn
    never closes and the elder waits on a socket that has gone quiet."""
    decoder = sarvam_ws.SarvamSTTDecoder()
    decoder.feed({"type": "events", "data": {"signal_type": "START_SPEECH"}})
    decoder.feed({"type": "events", "data": {"signal_type": "END_SPEECH"}})

    assert _kinds(decoder.force_end_of_speech()) == ["end_of_speech"]
    assert decoder.force_end_of_speech() == []
    # And the late transcript does not emit a second one.
    assert _kinds(decoder.feed({"type": "data", "data": {"transcript": "হ্যাঁ"}})) == ["final"]


def test_end_speech_asks_for_a_flush_exactly_once() -> None:
    """The flush is consumed by the send task so one writer owns the socket."""
    decoder = sarvam_ws.SarvamSTTDecoder()
    decoder.feed({"type": "events", "data": {"signal_type": "START_SPEECH"}})
    assert decoder.should_flush is False

    decoder.feed({"type": "events", "data": {"signal_type": "END_SPEECH"}})
    assert decoder.should_flush is True
    assert decoder.take_flush() is True
    assert decoder.take_flush() is False


def test_a_repeated_start_signal_does_not_restart_the_utterance() -> None:
    decoder = sarvam_ws.SarvamSTTDecoder()
    assert _kinds(decoder.feed({"type": "events", "data": {"signal_type": "START_SPEECH"}})) == [
        "start_of_speech"
    ]
    assert decoder.feed({"type": "events", "data": {"signal_type": "START_SPEECH"}}) == []


@pytest.mark.parametrize(
    "message",
    [
        {"type": "data", "data": {"transcript": "ডাঃ শর", "is_final": False}},
        {"type": "partial", "data": {"transcript": "ডাঃ শর"}},
        {"type": "data", "is_final": False, "data_": {}, "data": {"transcript": "ডাঃ শর"}},
    ],
)
def test_a_partial_is_never_promoted_to_a_final(message: dict) -> None:
    """Saaras v3 has no documented partial frame yet (see sarvam_ws). If one
    ever arrives, half a sentence must not be able to answer a readback."""
    decoder = sarvam_ws.SarvamSTTDecoder()
    events = decoder.feed(message)
    assert _kinds(events) == ["interim"]
    assert events[0].text == "ডাঃ শর"
    # ...and it does not satisfy a pending end-of-speech either.
    assert decoder.feed({"type": "events", "data": {"signal_type": "END_SPEECH"}}) == []


def test_an_error_frame_decodes_as_an_error() -> None:
    decoder = sarvam_ws.SarvamSTTDecoder()
    events = decoder.feed({"type": "error", "data": {"message": "quota exceeded", "code": 429}})
    assert _kinds(events) == ["error"]
    assert events[0].message == "quota exceeded"
    assert events[0].status_code == 429


def test_unknown_frames_are_ignored_rather_than_fatal() -> None:
    decoder = sarvam_ws.SarvamSTTDecoder()
    assert decoder.feed({"type": "keepalive"}) == []
    assert decoder.feed({"type": "events", "data": {"signal_type": "SOMETHING_NEW"}}) == []


def test_a_non_object_frame_raises_rather_than_decoding_to_silence() -> None:
    decoder = sarvam_ws.SarvamSTTDecoder()
    with pytest.raises(ValueError):
        decoder.feed("[1, 2]")


# -- the same decoder, driven by a fake socket -----------------------------


class FakeWSMessage:
    def __init__(self, data: str) -> None:
        self.data = data


class FakeWebSocket:
    """Replays canned text frames. No aiohttp, no socket, no key."""

    def __init__(self, frames: list[dict]) -> None:
        self._frames = [FakeWSMessage(json.dumps(frame)) for frame in frames]
        self.sent: list[str] = []

    async def send_str(self, payload: str) -> None:
        self.sent.append(payload)

    def __aiter__(self) -> FakeWebSocket:
        self._iter = iter(self._frames)
        return self

    async def __anext__(self) -> FakeWSMessage:
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration from None


async def _replay(ws: FakeWebSocket) -> list[sarvam_ws.STTEvent]:
    """The decode half of `_SarvamSpeechStream._read_messages`, verbatim in
    shape: feed every text frame, then release anything still held."""
    decoder = sarvam_ws.SarvamSTTDecoder()
    events: list[sarvam_ws.STTEvent] = []
    async for message in ws:
        events.extend(decoder.feed(message.data))
        if decoder.take_flush():
            await ws.send_str(sarvam_ws.stt_flush_frame())
    events.extend(decoder.force_end_of_speech())
    return events


def test_a_mocked_socket_produces_the_livekit_event_order() -> None:
    ws = FakeWebSocket(
        [
            {"type": "events", "data": {"signal_type": "START_SPEECH"}},
            {"type": "data", "data": {"transcript": "বৃহস্পতিবার", "language_code": "bn-IN"}},
            {"type": "events", "data": {"signal_type": "END_SPEECH"}},
        ]
    )
    events = asyncio.run(_replay(ws))

    assert _kinds(events) == ["start_of_speech", "final", "end_of_speech"]
    assert events[1].text == "বৃহস্পতিবার"
    assert events[1].language == "bn-IN"
    assert ws.sent == [sarvam_ws.stt_flush_frame()]


def test_a_socket_that_closes_before_the_final_still_closes_the_turn() -> None:
    ws = FakeWebSocket(
        [
            {"type": "events", "data": {"signal_type": "START_SPEECH"}},
            {"type": "events", "data": {"signal_type": "END_SPEECH"}},
        ]
    )
    assert _kinds(asyncio.run(_replay(ws))) == ["start_of_speech", "end_of_speech"]


# -- TTS frames ------------------------------------------------------------


def test_tts_url_asks_for_the_completion_event() -> None:
    """Without it the recv loop cannot tell "done" from "still generating"."""
    url = sarvam_ws.tts_ws_url(config.DEFAULT_TTS_WS_URL, model="bulbul:v3")
    assert url == "wss://api.sarvam.ai/text-to-speech/ws?model=bulbul%3Av3&send_completion_event=true"


def test_v3_config_carries_the_buffering_knobs_and_v2_does_not() -> None:
    def build(model: str) -> dict:
        return json.loads(
            sarvam_ws.tts_config_frame(
                target_language_code="bn-IN",
                speaker="anushka",
                model=model,
                pace=0.9,
                sample_rate=22050,
                output_audio_codec="linear16",
                min_buffer_size=50,
                max_chunk_length=150,
            )
        )

    v3 = build("bulbul:v3")
    assert v3["type"] == "config"
    assert v3["data"]["min_buffer_size"] == 50
    assert v3["data"]["speech_sample_rate"] == 22050
    assert v3["data"]["output_audio_codec"] == "linear16"

    assert "min_buffer_size" not in build("bulbul:v2")["data"]


def test_text_and_flush_frames() -> None:
    assert json.loads(sarvam_ws.tts_text_frame("নমস্কার")) == {
        "type": "text",
        "data": {"text": "নমস্কার"},
    }
    assert json.loads(sarvam_ws.tts_flush_frame()) == {"type": "flush"}


@pytest.mark.parametrize(
    ("message", "kind"),
    [
        ({"type": "audio", "data": {"audio": "AQID"}}, "audio"),
        ({"type": "audio", "data": {"audio": ""}}, "ignored"),
        ({"type": "event", "data": {"event_type": "final"}}, "final"),
        ({"type": "event", "data": {"event_type": "started"}}, "ignored"),
        ({"type": "error", "data": {"message": "bad speaker"}}, "error"),
        ({"type": "pong"}, "ignored"),
    ],
)
def test_tts_messages_decode(message: dict, kind: str) -> None:
    assert sarvam_ws.decode_tts_message(message).kind == kind


def test_audio_payloads_decode_to_bytes() -> None:
    chunk = sarvam_ws.decode_tts_message({"type": "audio", "data": {"audio": "AQID"}})
    assert chunk.audio == b"\x01\x02\x03"


def test_a_corrupt_audio_chunk_is_a_gap_not_a_dead_call() -> None:
    chunk = sarvam_ws.decode_tts_message({"type": "audio", "data": {"audio": "!!!not-base64"}})
    assert chunk.kind == "ignored"


# ==========================================================================
# Streaming on/off
# ==========================================================================


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, True),
        ("", True),
        ("1", True),
        ("true", True),
        ("yes", True),
        ("0", False),
        ("false", False),
        ("FALSE", False),
        ("no", False),
        ("off", False),
        ("maybe", True),  # a typo must not silently disable the socket
    ],
)
def test_streaming_switch_reads_one_env_var(
    monkeypatch: pytest.MonkeyPatch, value: str | None, expected: bool
) -> None:
    monkeypatch.delenv("SARVAM_STREAMING", raising=False)
    if value is not None:
        monkeypatch.setenv("SARVAM_STREAMING", value)
    assert config.SarvamSettings.from_env().streaming is expected


def test_socket_urls_and_rates_are_overridable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SARVAM_TTS_WS_URL", raising=False)
    monkeypatch.setenv("SARVAM_STT_WS_URL", "wss://staging.example/ws")
    monkeypatch.setenv("SARVAM_STT_SAMPLE_RATE", "8000")  # the Exotel channel
    monkeypatch.setenv("SARVAM_TTS_CODEC", "mp3")

    settings = config.SarvamSettings.from_env()
    assert settings.stt_ws_url == "wss://staging.example/ws"
    assert settings.stt_sample_rate == 8000
    assert settings.tts_ws_url == config.DEFAULT_TTS_WS_URL
    assert config.tts_mime_type(settings.tts_codec) == "audio/mp3"


def test_the_default_codec_bypasses_the_decoder() -> None:
    """`linear16` -> `audio/pcm` is what lets the emitter hand bytes straight
    to the room without the `livekit-agents[codecs]` extra."""
    assert config.tts_mime_type(config.DEFAULT_TTS_CODEC) == "audio/pcm"


def test_an_unknown_codec_fails_loudly() -> None:
    with pytest.raises(ValueError, match="Unsupported SARVAM_TTS_CODEC"):
        config.tts_mime_type("wav-ish")


def test_the_rest_payload_is_built_in_one_place() -> None:
    """The live adapter and the cache warmer share it, so a cached greeting
    cannot be synthesized with different settings than the live path."""
    payload = config.bulbul_rest_payload(
        text="নমস্কার",
        target_language_code="bn-IN",
        speaker="anushka",
        model="bulbul:v3",
        pace=0.9,
        sample_rate=22050,
    )
    assert payload["output_audio_codec"] == "wav"
    assert payload["speech_sample_rate"] == 22050
    assert payload["text"] == "নমস্কার"


# ==========================================================================
# The pre-synthesis cache
# ==========================================================================


@pytest.fixture
def frame_cache(tmp_path: Path) -> cache.TTSFrameCache:
    return cache.TTSFrameCache(
        settings=config.SarvamSettings(tts_voice="anushka"), directory=tmp_path
    )


def test_the_key_is_stable_across_instances(tmp_path: Path) -> None:
    """Not `hash()`: a per-process salt means the cache never hits again."""
    first = cache.TTSFrameCache(settings=config.SarvamSettings(), directory=tmp_path)
    second = cache.TTSFrameCache(settings=config.SarvamSettings(), directory=tmp_path)
    assert first.key("নমস্কার", language="bn") == second.key("নমস্কার", language="bn")


@pytest.mark.parametrize(
    "changed",
    [
        {"tts_voice": "manisha"},
        {"tts_model": "bulbul:v2"},
        {"tts_sample_rate": 8000},
        {"tts_pace": 1.0},
    ],
)
def test_anything_that_changes_the_sound_changes_the_key(
    tmp_path: Path, changed: dict
) -> None:
    """A cache that ignores one of these plays yesterday's voice for half the
    call."""
    base = cache.TTSFrameCache(settings=config.SarvamSettings(), directory=tmp_path)
    other = cache.TTSFrameCache(
        settings=config.SarvamSettings(**changed), directory=tmp_path
    )
    assert base.key("নমস্কার", language="bn") != other.key("নমস্কার", language="bn")


def test_text_and_language_are_part_of_the_key(frame_cache: cache.TTSFrameCache) -> None:
    key = frame_cache.key("নমস্কার", language="bn")
    assert key != frame_cache.key("নমস্কার ", language="bn")
    assert key != frame_cache.key("नमस्ते", language="hi")
    assert key != frame_cache.key("নমস্কার", language="hi")


def test_a_miss_is_none_and_a_hit_round_trips(frame_cache: cache.TTSFrameCache) -> None:
    assert frame_cache.load("নমস্কার", language="bn") is None
    assert frame_cache.has("নমস্কার", language="bn") is False

    stored = frame_cache.store("নমস্কার", language="bn", wav=make_wav(samples=100))
    assert stored.is_file()
    assert frame_cache.has("নমস্কার", language="bn") is True

    audio = frame_cache.load("নমস্কার", language="bn")
    assert audio is not None
    assert audio.sample_rate == 22050
    assert audio.num_channels == 1
    assert len(audio.pcm) == 200
    assert audio.duration_s == pytest.approx(100 / 22050)


def test_lookup_is_exact_match_only(frame_cache: cache.TTSFrameCache) -> None:
    """Guessing which fixed line the model meant is how an elder gets read the
    wrong reviewed copy."""
    frame_cache.store("নমস্কার, আমি সাথী।", language="bn", wav=make_wav())
    assert frame_cache.load("নমস্কার, আমি সাথী", language="bn") is None
    assert frame_cache.load("নমস্কার, আমি সাথী।", language="bn") is not None


def test_the_voice_is_visible_in_the_path(frame_cache: cache.TTSFrameCache) -> None:
    assert frame_cache.path("নমস্কার", language="bn").parent.name == "anushka"


def test_an_unreadable_entry_degrades_to_a_miss(frame_cache: cache.TTSFrameCache) -> None:
    """A truncated file must cost one synthesis, not the call."""
    target = frame_cache.path("নমস্কার", language="bn")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(b"not a wav")
    assert frame_cache.load("নমস্কার", language="bn") is None


def test_eight_bit_audio_is_refused(frame_cache: cache.TTSFrameCache) -> None:
    """Played as int16 it is a burst of noise into the ear of someone who was
    expecting a person."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(1)
        handle.setframerate(22050)
        handle.writeframes(b"\x01" * 64)
    with pytest.raises(ValueError, match="16-bit"):
        cache.pcm_from_wav(buffer.getvalue())


def test_the_fixed_frames_are_every_reviewed_line() -> None:
    frames = cache.fixed_frames()
    names = {frame.name for frame in frames}
    assert names == set(prompts.FIXED_FRAMES)
    assert len(frames) == len(prompts.FIXED_FRAMES) * len(cache.CACHED_LANGUAGES)

    bengali_greeting = next(
        frame for frame in frames if frame.name == "greeting" and frame.language == "bn"
    )
    assert bengali_greeting.text == prompts.greeting_copy("bn")


def test_fixed_frames_can_be_narrowed_to_one_language() -> None:
    frames = cache.fixed_frames(["bn"])
    assert {frame.language for frame in frames} == {"bn"}


def test_warming_skips_what_is_already_on_disk(frame_cache: cache.TTSFrameCache) -> None:
    frames = cache.fixed_frames(["bn"])
    calls: list[str] = []

    async def synthesize(text: str, language: str) -> bytes:
        calls.append(text)
        return make_wav(samples=32)

    first = asyncio.run(frame_cache.warm(frames, synthesize=synthesize))
    assert first == {"synthesized": len(frames), "cached": 0, "failed": 0}
    assert len(calls) == len(frames)

    calls.clear()
    second = asyncio.run(frame_cache.warm(frames, synthesize=synthesize))
    assert second == {"synthesized": 0, "cached": len(frames), "failed": 0}
    assert calls == []

    forced = asyncio.run(frame_cache.warm(frames, synthesize=synthesize, force=True))
    assert forced["synthesized"] == len(frames)


def test_one_bad_frame_does_not_abandon_the_rest(frame_cache: cache.TTSFrameCache) -> None:
    """A warm run that gets five of six is still five fewer synthesis calls a
    call."""
    frames = cache.fixed_frames(["bn"])
    failing = frames[0].text

    async def synthesize(text: str, language: str) -> bytes:
        if text == failing:
            raise RuntimeError("429 from Sarvam")
        return make_wav(samples=32)

    report = asyncio.run(frame_cache.warm(frames, synthesize=synthesize))
    assert report["failed"] == 1
    assert report["synthesized"] == len(frames) - 1
    assert frame_cache.has(failing, language="bn") is False


def test_a_batch_response_uses_one_container(caplog: pytest.LogCaptureFixture) -> None:
    """Concatenating WAV containers produces a file whose header lies about
    its length, so the extras are dropped loudly."""
    import base64

    first, second = make_wav(samples=10), make_wav(samples=20)
    encoded = [base64.b64encode(first).decode(), base64.b64encode(second).decode()]
    with caplog.at_level("WARNING"):
        assert cache.first_wav(encoded) == first
    assert "using the first" in caplog.text


def test_the_cache_directory_is_overridable(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SAATHI_TTS_CACHE_DIR", str(tmp_path / "frames"))
    assert cache.cache_dir() == tmp_path / "frames"


def test_the_list_command_runs_on_an_empty_cache(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("SAATHI_TTS_CACHE_DIR", str(tmp_path))
    monkeypatch.delenv("SARVAM_API_KEY", raising=False)
    assert cache.main(["list"]) == 0
    assert "0 entries" in capsys.readouterr().out


def test_the_dry_run_names_what_is_missing_without_a_key(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """The warm CLI is a deploy step; `--dry-run` must work before anyone has
    exported credentials."""
    monkeypatch.setenv("SAATHI_TTS_CACHE_DIR", str(tmp_path))
    monkeypatch.delenv("SARVAM_API_KEY", raising=False)
    assert cache.main(["warm", "--languages", "bn", "--dry-run"]) == 0
    out = capsys.readouterr().out
    assert "MISSING" in out
    assert prompts.greeting_copy("bn") in out


# ==========================================================================
# Latency instrumentation
# ==========================================================================


def test_percentiles_interpolate_like_numpy() -> None:
    sample = [float(n) for n in range(1, 11)]
    assert metrics.percentile(sample, 50) == pytest.approx(5.5)
    assert metrics.percentile(sample, 95) == pytest.approx(9.55)
    assert metrics.percentile(sample, 0) == pytest.approx(1.0)
    assert metrics.percentile(sample, 100) == pytest.approx(10.0)


def test_percentiles_of_one_and_of_none() -> None:
    assert metrics.percentile([0.42], 95) == pytest.approx(0.42)
    with pytest.raises(ValueError):
        metrics.percentile([], 50)


def test_percentiles_do_not_assume_sorted_input() -> None:
    assert metrics.percentile([9.0, 1.0, 5.0], 50) == pytest.approx(5.0)


def test_the_first_stamp_for_a_stage_wins() -> None:
    """A turn can be re-entered - a barge-in, a retried synthesis - and the
    first time the elder stopped talking is still when their clock started."""
    clock = metrics.TurnClock(session_id="s", turn=1)
    clock.stamp("user_speech_end", at=10.0)
    clock.stamp("user_speech_end", at=99.0)
    assert clock.stamps["user_speech_end"] == 10.0


def test_an_unknown_stage_is_a_typo_not_a_new_metric() -> None:
    clock = metrics.TurnClock(session_id="s", turn=1)
    with pytest.raises(KeyError):
        clock.stamp("llm_first_token")


def test_spans_are_computed_from_the_stamps() -> None:
    clock = metrics.TurnClock(session_id="lk_room", turn=3)
    for stage, at in [
        ("user_speech_end", 100.0),
        ("stt_final", 100.4),
        ("llm_done", 101.2),
        ("tts_first_chunk", 101.5),
        ("playback_start", 101.55),
        ("playback_end", 103.0),
    ]:
        clock.stamp(stage, at=at)

    record = clock.record()
    spans = record["spans"]
    assert spans["stt"] == pytest.approx(0.4)
    assert spans["think"] == pytest.approx(0.8)
    assert spans["tts_first_chunk"] == pytest.approx(0.3)
    assert spans["response"] == pytest.approx(1.55)
    assert record["turn"] == 3
    assert record["session_id"] == "lk_room"


def test_a_span_with_a_missing_stamp_is_absent_rather_than_zero() -> None:
    """A turn that never played back must not report a 0ms response time and
    flatter the p50."""
    clock = metrics.TurnClock(session_id="s", turn=1)
    clock.stamp("user_speech_end", at=1.0)
    assert clock.elapsed("response") is None
    assert "response" not in clock.record()["spans"]


def test_records_round_trip_through_jsonl(tmp_path: Path) -> None:
    recorder = metrics.MetricsRecorder("lk_room", directory=tmp_path)
    for turn in range(1, 4):
        clock = metrics.TurnClock(session_id="lk_room", turn=turn)
        clock.stamp("user_speech_end", at=0.0)
        clock.stamp("playback_start", at=float(turn))
        assert recorder.write(clock) is True

    records = metrics.read_records(tmp_path)
    assert [record["turn"] for record in records] == [1, 2, 3]
    assert [record["spans"]["response"] for record in records] == [1.0, 2.0, 3.0]


def test_a_session_id_cannot_escape_the_metrics_directory(tmp_path: Path) -> None:
    """The room name comes from the dispatcher, so it is input. Separators are
    what make it dangerous; leftover dots in a flat filename are not."""
    recorder = metrics.MetricsRecorder("../../etc/room", directory=tmp_path)
    assert recorder.path.resolve().parent == tmp_path.resolve()
    assert not {"/", "\\"} & set(recorder.path.name)

    recorder.write(metrics.TurnClock(session_id="../../etc/room", turn=1))
    assert [path.parent for path in tmp_path.glob("*.jsonl")] == [tmp_path]


def test_a_malformed_line_is_skipped_not_fatal(tmp_path: Path) -> None:
    (tmp_path / "call.jsonl").write_text(
        '{"turn": 1, "spans": {"response": 0.5}}\nnot json\n\n', encoding="utf-8"
    )
    assert [record["turn"] for record in metrics.read_records(tmp_path)] == [1]


def test_the_summary_maths(tmp_path: Path) -> None:
    records = [
        {"spans": {"response": value}, "cache_hit": value < 0.3, "streaming": True}
        for value in (0.1, 0.2, 0.3, 0.4, 0.5)
    ]
    summary = metrics.summarize(records)

    assert summary["turns"] == 5
    assert summary["cache_hits"] == 2
    assert summary["streamed"] == 5
    response = next(row for row in summary["spans"] if row["span"] == "response")
    assert response["count"] == 5
    assert response["p50"] == pytest.approx(0.3)
    assert response["p95"] == pytest.approx(0.48)
    assert response["mean"] == pytest.approx(0.3)
    assert response["worst"] == pytest.approx(0.5)


def test_the_report_says_so_when_there_is_nothing(tmp_path: Path) -> None:
    assert metrics.format_report(metrics.summarize([])) == "no turns recorded"


def test_the_report_cli_reads_a_directory(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    recorder = metrics.MetricsRecorder("lk_room", directory=tmp_path)
    clock = metrics.TurnClock(session_id="lk_room", turn=1)
    clock.stamp("user_speech_end", at=0.0)
    clock.stamp("playback_start", at=1.25)
    recorder.write(clock)

    assert metrics.main(["report", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "turns=1" in out
    assert "1250ms" in out

    assert metrics.main(["report", str(tmp_path), "--json"]) == 0
    parsed = json.loads(capsys.readouterr().out)
    assert parsed["turns"] == 1


def test_the_report_cli_says_where_it_looked(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert metrics.main(["report", str(tmp_path / "nope")]) == 1
    assert "no metrics at" in capsys.readouterr().err


def test_the_metrics_directory_is_overridable(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("SAATHI_METRICS_DIR", str(tmp_path / "runs"))
    assert metrics.metrics_dir() == tmp_path / "runs"


def test_there_is_no_first_token_stage() -> None:
    """The core is synchronous and runs a whole tool loop per turn, so there
    is no first token to stamp. `llm_done` is the honest name."""
    assert "llm_first_token" not in metrics.STAGES
    assert metrics.STAGES[:3] == ("user_speech_end", "stt_final", "llm_done")


# ==========================================================================
# The pure modules stay pure
# ==========================================================================


@pytest.mark.parametrize(
    "module",
    ["saathi_agent.voice.sarvam_ws", "saathi_agent.voice.cache", "saathi_agent.voice.metrics"],
)
def test_the_week_three_modules_import_without_the_voice_extra(module: str) -> None:
    """The wire contract, the cache and the report all have to be reachable in
    the base install - that is the whole reason they are separate from the
    adapters."""
    import importlib

    assert importlib.import_module(module) is not None


@pytest.mark.skipif(not LIVEKIT_INSTALLED, reason="needs the voice extra")
def test_the_adapters_follow_the_streaming_switch() -> None:
    from saathi_agent.voice.sarvam_stt import SarvamSTT
    from saathi_agent.voice.sarvam_tts import SarvamTTS

    streamed_stt = SarvamSTT(api_key="test-key", streaming=True)
    assert streamed_stt.capabilities.streaming is True
    assert streamed_stt.capabilities.interim_results is True

    rest_stt = SarvamSTT(api_key="test-key", streaming=False)
    assert rest_stt.capabilities.streaming is False
    with pytest.raises(NotImplementedError, match="SARVAM_STREAMING=0"):
        rest_stt.stream()

    rest_tts = SarvamTTS(api_key="test-key", language="bn", streaming=False)
    assert rest_tts.capabilities.streaming is False
    with pytest.raises(NotImplementedError, match="SARVAM_STREAMING=0"):
        rest_tts.stream()


@pytest.mark.skipif(not LIVEKIT_INSTALLED, reason="needs the voice extra")
def test_the_streaming_tts_owns_its_sentence_tokenizer() -> None:
    """The framework only inserts its tokenizer in front of a `streaming=False`
    TTS, so a streaming plugin that does not split sentences itself sends the
    whole reply as one request and loses the entire point of the socket."""
    from livekit.agents import tokenize

    from saathi_agent.voice.sarvam_tts import SarvamTTS

    streamed = SarvamTTS(api_key="test-key", language="bn", streaming=True)
    assert isinstance(streamed._tokenizer, tokenize.SentenceTokenizer)
