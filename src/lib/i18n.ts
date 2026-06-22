import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from '../locales/en.json';
import hi from '../locales/hi.json';

const deviceLang = getLocales()?.[0]?.languageCode ?? 'hi';
// Default to Hindi for our primary users; fall back to English.
const initialLang = deviceLang === 'en' ? 'en' : 'hi';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
  },
  lng: initialLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
