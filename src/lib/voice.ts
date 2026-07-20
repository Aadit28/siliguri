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
  onEnd?: () => void;
  onError?: (message: string) => void;
}): { stop: () => void } | null {
  if (!speechRecognitionSupported()) return null;

  if (currentRecognition) {
    try {
      currentRecognition.stop();
    } catch {
      // already stopped
    }
    currentRecognition = null;
  }

  const RecognitionCtor = (globalThis as any).webkitSpeechRecognition || (globalThis as any).SpeechRecognition;
  const recognition: any = new RecognitionCtor();
  recognition.lang = localeFor(opts.lang);
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    let text = '';
    for (let i = 0; i < event.results.length; i += 1) {
      if (event.results[i].isFinal) {
        text += event.results[i][0].transcript;
      }
    }
    opts.onResult(text.trim());
  };
  recognition.onend = () => {
    if (currentRecognition === recognition) currentRecognition = null;
    opts.onEnd?.();
  };
  recognition.onerror = (event: any) => {
    opts.onError?.(event?.error ?? 'Speech recognition error');
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
      recognition.stop();
    },
  };
}

export async function speak(text: string, lang: VoiceLang): Promise<void> {
  if (!text.trim()) return;
  // Speech.stop() is async — a pending stop can cancel the new utterance on iOS/Android.
  await Speech.stop();
  Speech.speak(text, { language: localeFor(lang) });
}

export function stopSpeaking(): void {
  Speech.stop();
}
