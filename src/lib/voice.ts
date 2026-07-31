import * as Speech from 'expo-speech';

type VoiceLang = 'en' | 'hi';

function localeFor(lang: VoiceLang) {
  return lang === 'hi' ? 'hi-IN' : 'en-IN';
}

export function speechRecognitionSupported(): boolean {
  return Boolean((globalThis as any).webkitSpeechRecognition || (globalThis as any).SpeechRecognition);
}

let currentRecognition: any = null;

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
