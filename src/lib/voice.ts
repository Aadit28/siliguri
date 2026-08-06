import * as Speech from 'expo-speech';
import { backendRequest } from './backend';

type VoiceLang = 'en' | 'hi';

/**
 * What /api/voice/token hands back: everything the client needs to join the
 * elder's room, including the ws URL, so the app carries no LiveKit config of
 * its own.
 */
export type VoiceTokenGrant = {
  token: string;
  /** `wss://…` of the LiveKit project. */
  url: string;
  /** Deterministic `saathi-<elderId>` — one room per elder. */
  room: string;
  /** The DEVICE HOLDER, which is the guardian's id when they call for a parent. */
  identity: string;
  elderId: string;
};

/**
 * Mints a room token for a live call with the Saathi agent.
 *
 * `elderId` is only needed when a guardian looks after more than one parent;
 * the server resolves it from family_links otherwise and answers 400 when the
 * choice is genuinely ambiguous.
 *
 * Throws with backendRequest's `code` attached. The one the caller must handle
 * rather than show is `voice_not_configured` (503) — the LiveKit credentials
 * are not on the server yet, which is a "coming soon", not a failure.
 */
export async function requestVoiceToken(token: string, elderId?: string | null): Promise<VoiceTokenGrant> {
  return backendRequest<VoiceTokenGrant>('/api/voice/token', {
    method: 'POST',
    token,
    body: elderId ? { elderId } : {},
  });
}

function localeFor(lang: VoiceLang) {
  return lang === 'hi' ? 'hi-IN' : 'en-IN';
}

export function speechRecognitionSupported(): boolean {
  return Boolean((globalThis as any).webkitSpeechRecognition || (globalThis as any).SpeechRecognition);
}

let currentRecognition: any = null;

/**
 * Raises the browser's microphone prompt.
 *
 * MUST NOT be awaited before `startListening`. iOS Safari requires
 * `SpeechRecognition.start()` to be called synchronously inside the user
 * gesture that triggered it; awaiting anything first discards the gesture
 * context and start() then fails with `not-allowed` — even when the user has
 * already granted the microphone. That produced a maddening bug where the
 * Safari prompt appeared, the user tapped Allow, and dictation still never ran.
 *
 * Correct order: start recognition synchronously on tap, and only call this
 * afterwards, from the error path, so the next tap has permission in hand.
 */
export async function requestMicPermission(): Promise<'granted' | 'blocked' | 'unknown'> {
  const mediaDevices = (globalThis as any).navigator?.mediaDevices;
  if (!mediaDevices?.getUserMedia) return 'unknown';
  try {
    const stream = await mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return 'granted';
  } catch (error: any) {
    const name = String(error?.name ?? '');
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked';
    // NotFoundError and friends: let recognition report its own error.
    return 'unknown';
  }
}

// Recognition error codes (and getUserMedia exception names) mapped to the
// assistant.voice.* copy key telling the user what they can actually do.
export function voiceErrorKey(code: string): 'micBlocked' | 'dictationOff' | 'noMic' | 'error' {
  const value = code.toLowerCase();
  // iOS reports service-not-allowed when Siri & Dictation is switched off.
  if (value.includes('service-not-allowed')) return 'dictationOff';
  if (value.includes('not-allowed') || value.includes('permission') || value.includes('security')) return 'micBlocked';
  if (value.includes('audio-capture') || value.includes('notfound')) return 'noMic';
  return 'error';
}

export function startListening(opts: {
  lang: VoiceLang;
  onResult: (text: string) => void;
  // Live partial transcript, so the elder sees their words appear as they talk.
  onInterim?: (text: string) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}): { stop: () => void } | null {
  if (!speechRecognitionSupported()) return null;

  if (currentRecognition) {
    try {
      currentRecognition.abort();
    } catch {
      // already stopped
    }
    currentRecognition = null;
  }

  const RecognitionCtor = (globalThis as any).webkitSpeechRecognition || (globalThis as any).SpeechRecognition;
  const recognition: any = new RecognitionCtor();
  recognition.lang = localeFor(opts.lang);
  recognition.interimResults = Boolean(opts.onInterim);
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let sawFinal = false;
  recognition.onresult = (event: any) => {
    let text = '';
    let interim = '';
    for (let i = 0; i < event.results.length; i += 1) {
      if (event.results[i].isFinal) {
        text += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    if (interim.trim()) opts.onInterim?.(interim.trim());
    if (text.trim()) {
      sawFinal = true;
      opts.onResult(text.trim());
    }
  };
  recognition.onend = () => {
    if (currentRecognition === recognition) currentRecognition = null;
    opts.onEnd?.();
  };
  recognition.onerror = (event: any) => {
    const code = String(event?.error ?? 'Speech recognition error');
    // Silence and user cancellation are normal endings, not errors to show.
    if (code === 'no-speech' || code === 'aborted') return;
    opts.onError?.(code);
  };

  try {
    recognition.start();
  } catch (error: any) {
    opts.onError?.(error?.message ?? 'Speech recognition error');
    return null;
  }
  currentRecognition = recognition;

  return {
    stop: () => {
      if (currentRecognition === recognition) currentRecognition = null;
      try {
        // abort() unless a final result already landed: stop() would still
        // deliver one and send a message the user chose to cancel.
        if (sawFinal) recognition.stop();
        else recognition.abort();
      } catch {
        // already stopped
      }
    },
  };
}

export async function speak(text: string, lang: VoiceLang, onDone?: () => void): Promise<void> {
  if (!text.trim()) {
    onDone?.();
    return;
  }
  // Speech.stop() is async — a pending stop can cancel the new utterance on iOS/Android.
  await Speech.stop();
  // Fire the completion exactly once, whether the utterance finished, was
  // interrupted, or failed — the hands-free loop restarts the mic on it.
  let notified = false;
  const done = () => {
    if (notified) return;
    notified = true;
    onDone?.();
  };
  Speech.speak(text.slice(0, 3500), {
    language: localeFor(lang),
    onDone: done,
    onStopped: done,
    onError: done,
  });
}

export function stopSpeaking(): void {
  Speech.stop();
}
