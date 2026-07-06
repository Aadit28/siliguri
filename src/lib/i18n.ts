import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import { SUPPORTED_LANGUAGES, isSupportedLang } from './languages';
import { languageOverlays, TranslationTree } from './languageOverlays';

const deviceLang = getLocales()?.[0]?.languageCode ?? 'hi';
// Default to Hindi for our primary users; support UMANG-style choices.
const initialLang = isSupportedLang(deviceLang) ? deviceLang : 'hi';

function mergeTranslations(base: TranslationTree, overlay: TranslationTree = {}): TranslationTree {
  return Object.entries(base).reduce<TranslationTree>((acc, [key, value]) => {
    const overlayValue = overlay[key];
    if (
      value &&
      typeof value === 'object' &&
      overlayValue &&
      typeof overlayValue === 'object'
    ) {
      acc[key] = mergeTranslations(value, overlayValue);
      return acc;
    }

    acc[key] = typeof overlayValue === 'string' ? overlayValue : value;
    return acc;
  }, {});
}

const resources = SUPPORTED_LANGUAGES.reduce(
  (acc, language) => {
    const overlay =
      language.code === 'hi'
        ? (hi as TranslationTree)
        : languageOverlays[language.code] ?? {};
    acc[language.code] = {
      translation:
        language.code === 'en' ? en : mergeTranslations(en as TranslationTree, overlay),
    };
    return acc;
  },
  {} as Record<string, { translation: TranslationTree }>,
);

i18n.use(initReactI18next).init({
  resources,
  lng: initialLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
