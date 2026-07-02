import * as Speech from 'expo-speech';

type VoiceLang = 'en' | 'hi';

function localeFor(lang: VoiceLang) {
  return lang === 'hi' ? 'hi-IN' : 'en-IN';
}

export function speechRecognitionSupported(): boolean {
  return Boolean((globalThis as any).webkitSpeechRecognition || (globalThis as any).SpeechRecognition);
}

export function startListening(opts: {
  lang: VoiceLang;
  onResult: (text: string) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}): { stop: () => void } | null {
  if (!speechRecognitionSupported()) return null;

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
    opts.onEnd?.();
  };
  recognition.onerror = (event: any) => {
    opts.onError?.(event?.error ?? 'Speech recognition error');
  };

  recognition.start();

  return {
    stop: () => recognition.stop(),
  };
}

export function speak(text: string, lang: VoiceLang): void {
  if (!text.trim()) return;
  Speech.stop();
  Speech.speak(text, { language: localeFor(lang) });
}

export function stopSpeaking(): void {
  Speech.stop();
}
