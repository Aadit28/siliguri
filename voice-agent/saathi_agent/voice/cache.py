"""Pre-synthesized audio for the lines that never change.

Six of the sentences the elder hears are reviewed copy, not model output:
the greeting, the silence re-prompt, the handoff line, the polite close, the
error apology, and the fixed tail of the readback. Every call pays Bulbul for
the same audio, and the greeting pays it at the worst possible moment - the
first second of the call, when nothing else is warm.

So they are synthesized once, to disk, and played from there. A cache hit is
the difference between "namaskar" starting in ~40ms and starting in ~700ms.

Deliberately free of LiveKit: the warm CLI has to run in the base install,
and turning PCM into `rtc.AudioFrame` is the worker's job, not the cache's.
The cache hands back bytes and a sample rate.

    python -m saathi_agent.voice.cache warm         # synthesize everything
    python -m saathi_agent.voice.cache list         # what is on disk

Keys cover every setting that changes how the audio sounds - voice, model,
language, sample rate, pace, codec - because a cache that ignores one of them
is a cache that plays yesterday's voice for half the call.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import io
import json
import logging
import os
import sys
import wave
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Awaitable, Callable, Iterable, Sequence

from ..prompts import FIXED_FRAMES
from .config import (
    DEFAULT_TTS_CACHE_DIR,
    SarvamSettings,
    bulbul_rest_payload,
    sarvam_language,
    utf8_console,
)

logger = logging.getLogger("saathi.voice.cache")

SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"

#: The languages an elder call can be conducted in (`prompts.Language`).
CACHED_LANGUAGES: tuple[str, ...] = ("bn", "hi", "en")


def cache_dir() -> Path:
    return Path(os.environ.get("SAATHI_TTS_CACHE_DIR") or DEFAULT_TTS_CACHE_DIR)


# --------------------------------------------------------------------------
# WAV
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class CachedAudio:
    """Decoded cache entry. Raw little-endian int16, ready to frame."""

    pcm: bytes
    sample_rate: int
    num_channels: int

    @property
    def duration_s(self) -> float:
        frames = len(self.pcm) / (2 * max(self.num_channels, 1))
        return frames / self.sample_rate if self.sample_rate else 0.0


def pcm_from_wav(wav_bytes: bytes) -> tuple[bytes, int, int]:
    """WAV container -> (pcm, sample_rate, num_channels).

    Raises on anything that is not 16-bit PCM rather than passing bytes on:
    a wrong sample width played as int16 is a burst of noise into the ear of
    someone who was expecting a person.
    """
    with wave.open(io.BytesIO(wav_bytes), "rb") as handle:
        if handle.getsampwidth() != 2:
            raise ValueError(
                f"expected 16-bit PCM, got {handle.getsampwidth() * 8}-bit audio"
            )
        return (
            handle.readframes(handle.getnframes()),
            handle.getframerate(),
            handle.getnchannels(),
        )


# --------------------------------------------------------------------------
# Frames
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class FrameSpec:
    """One fixed line, in one language."""

    name: str
    language: str
    text: str


def fixed_frames(languages: Sequence[str] | None = None) -> list[FrameSpec]:
    """Every reviewed line the agent can speak verbatim.

    Walks `prompts.FIXED_FRAMES`, so a new line added there is warmed on the
    next run without touching this module.
    """
    wanted = tuple(languages or CACHED_LANGUAGES)
    frames: list[FrameSpec] = []
    for name, copy in FIXED_FRAMES.items():
        for language in wanted:
            text = copy.get(language)
            if text:
                frames.append(FrameSpec(name=name, language=language, text=text))
    return frames


# --------------------------------------------------------------------------
# The cache
# --------------------------------------------------------------------------

#: A caller-supplied synthesizer: (text, language) -> WAV bytes. Injected so
#: the warm path is testable and so the worker can reuse its live adapter.
Synthesizer = Callable[[str, str], Awaitable[bytes]]


class TTSFrameCache:
    """Disk cache of synthesized fixed frames, keyed on how they sound."""

    def __init__(
        self,
        *,
        settings: SarvamSettings | None = None,
        voice: str | None = None,
        model: str | None = None,
        sample_rate: int | None = None,
        pace: float | None = None,
        directory: Path | str | None = None,
    ) -> None:
        resolved = settings or SarvamSettings.from_env()
        self.voice = voice or resolved.tts_voice
        self.model = model or resolved.tts_model
        self.sample_rate = sample_rate or resolved.tts_sample_rate
        self.pace = resolved.tts_pace if pace is None else pace
        self.directory = Path(directory) if directory is not None else cache_dir()
        self._memo: dict[str, CachedAudio] = {}

    # -- addressing ------------------------------------------------------
    def key(self, text: str, *, language: str) -> str:
        """Stable across processes: a sorted-JSON digest, not `hash()`."""
        material = json.dumps(
            {
                "text": text,
                "voice": self.voice,
                "model": self.model,
                "language": sarvam_language(language),
                "sample_rate": self.sample_rate,
                "pace": self.pace,
                "codec": "wav",
            },
            sort_keys=True,
            ensure_ascii=False,
        )
        return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]

    def path(self, text: str, *, language: str) -> Path:
        # Voice in the directory name so `ls` answers "which voice is warm?".
        return self.directory / self.voice / f"{self.key(text, language=language)}.wav"

    def has(self, text: str, *, language: str) -> bool:
        return self.path(text, language=language).is_file()

    # -- reading ---------------------------------------------------------
    def load(self, text: str, *, language: str) -> CachedAudio | None:
        """The cached audio for this exact text, or None.

        Exact match only. A near-match is a different sentence, and guessing
        which fixed line the model meant is how an elder gets read the wrong
        reviewed copy.
        """
        entry = self._memo.get(self.key(text, language=language))
        if entry is not None:
            return entry

        target = self.path(text, language=language)
        if not target.is_file():
            return None
        try:
            pcm, sample_rate, channels = pcm_from_wav(target.read_bytes())
        except (OSError, wave.Error, ValueError):
            logger.warning("unreadable cache entry %s; re-synthesizing this turn", target)
            return None

        entry = CachedAudio(pcm=pcm, sample_rate=sample_rate, num_channels=channels)
        self._memo[self.key(text, language=language)] = entry
        return entry

    # -- writing ---------------------------------------------------------
    def store(self, text: str, *, language: str, wav: bytes) -> Path:
        target = self.path(text, language=language)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(wav)
        self._memo.pop(self.key(text, language=language), None)
        return target

    def entries(self) -> list[Path]:
        root = self.directory / self.voice
        return sorted(root.glob("*.wav")) if root.is_dir() else []

    # -- warming ---------------------------------------------------------
    async def warm(
        self,
        frames: Iterable[FrameSpec],
        *,
        synthesize: Synthesizer,
        force: bool = False,
    ) -> dict[str, int]:
        """Synthesize the frames that are not already on disk.

        Sequential on purpose: this runs once at deploy time against a rate
        limited API, and a parallel burst that gets half the frames 429'd is
        a cache that is quietly incomplete.
        """
        report = {"synthesized": 0, "cached": 0, "failed": 0}
        for frame in frames:
            if not force and self.has(frame.text, language=frame.language):
                report["cached"] += 1
                continue
            try:
                wav = await synthesize(frame.text, frame.language)
            except Exception as exc:
                # One bad frame must not abandon the rest: a warm run that
                # gets five of six is still five fewer synthesis calls a call.
                logger.error("could not synthesize %s/%s: %s", frame.name, frame.language, exc)
                report["failed"] += 1
                continue
            self.store(frame.text, language=frame.language, wav=wav)
            report["synthesized"] += 1
            logger.info("warmed %s/%s (%d bytes)", frame.name, frame.language, len(wav))
        return report


# --------------------------------------------------------------------------
# REST synthesizer for the CLI
# --------------------------------------------------------------------------


def rest_synthesizer(settings: SarvamSettings, *, timeout: float = 30.0) -> Synthesizer:
    """A `Synthesizer` over `/text-to-speech`.

    Its own httpx call rather than `SarvamTTS`: the warm CLI is a deploy step
    and must run in the base install, which has no LiveKit.
    """
    import httpx

    async def synthesize(text: str, language: str) -> bytes:
        payload = bulbul_rest_payload(
            text=text,
            target_language_code=sarvam_language(language),
            speaker=settings.tts_voice,
            model=settings.tts_model,
            pace=settings.tts_pace,
            sample_rate=settings.tts_sample_rate,
            output_audio_codec="wav",
        )
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                SARVAM_TTS_URL,
                headers={
                    "api-subscription-key": settings.require_api_key(),
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if response.status_code != 200:
            raise RuntimeError(f"Sarvam TTS error ({response.status_code}): {response.text}")
        audios = response.json().get("audios")
        if not audios or not isinstance(audios, list):
            raise RuntimeError("Sarvam TTS returned no audio")
        return first_wav(audios)

    return synthesize


def first_wav(audios: Sequence[str]) -> bytes:
    """The single WAV from a `/text-to-speech` response.

    The field is a list because the batch API accepts several texts; we send
    one. Concatenating containers would produce a file whose header lies
    about its length, so extras are dropped loudly instead.
    """
    import base64

    if len(audios) > 1:
        logger.warning("Sarvam returned %d audio parts for one text; using the first", len(audios))
    return base64.b64decode(audios[0])


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m saathi_agent.voice.cache",
        description="Pre-synthesize the fixed spoken frames (BUILD_GUIDE D.5).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    warm = sub.add_parser("warm", help="synthesize every fixed frame that is missing")
    warm.add_argument(
        "--languages",
        default=",".join(CACHED_LANGUAGES),
        help=f"comma-separated (default: {','.join(CACHED_LANGUAGES)})",
    )
    warm.add_argument("--voice", default=None, help="override BULBUL_VOICE")
    warm.add_argument("--force", action="store_true", help="re-synthesize entries already on disk")
    warm.add_argument(
        "--dry-run", action="store_true", help="list what would be synthesized, call nothing"
    )

    listing = sub.add_parser("list", help="what is on disk for the configured voice")
    listing.add_argument("--voice", default=None, help="override BULBUL_VOICE")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    utf8_console()
    logging.basicConfig(level=os.environ.get("SAATHI_LOG_LEVEL", "INFO"), format="%(message)s")
    args = _build_parser().parse_args(argv)
    settings = SarvamSettings.from_env()
    if args.voice:
        settings = replace(settings, tts_voice=args.voice)
    cache = TTSFrameCache(settings=settings)

    if args.command == "list":
        entries = cache.entries()
        print(f"{cache.directory / cache.voice}: {len(entries)} entries")
        for entry in entries:
            print(f"  {entry.name}  {entry.stat().st_size:>8} bytes")
        return 0

    frames = fixed_frames([lang.strip() for lang in args.languages.split(",") if lang.strip()])
    if args.dry_run:
        for frame in frames:
            state = "cached" if cache.has(frame.text, language=frame.language) else "MISSING"
            print(f"{state:>7}  {frame.name}/{frame.language}  {frame.text}")
        return 0

    report = asyncio.run(
        cache.warm(frames, synthesize=rest_synthesizer(settings), force=args.force)
    )
    print(
        f"voice={cache.voice} synthesized={report['synthesized']} "
        f"cached={report['cached']} failed={report['failed']} -> {cache.directory / cache.voice}"
    )
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
