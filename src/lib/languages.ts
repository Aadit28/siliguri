export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English', shortLabel: 'EN' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', shortLabel: 'HI' },
  { code: 'as', label: 'Assamese', nativeLabel: 'অসমীয়া', shortLabel: 'AS' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', shortLabel: 'BN' },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી', shortLabel: 'GU' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', shortLabel: 'KN' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം', shortLabel: 'ML' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी', shortLabel: 'MR' },
  { code: 'or', label: 'Odia', nativeLabel: 'ଓଡ଼ିଆ', shortLabel: 'OR' },
  { code: 'pa', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ', shortLabel: 'PA' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', shortLabel: 'TA' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', shortLabel: 'TE' },
  { code: 'ur', label: 'Urdu', nativeLabel: 'اردو', shortLabel: 'UR' },
] as const;

export type Lang = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const LANGUAGE_CODES = new Set<string>(SUPPORTED_LANGUAGES.map((language) => language.code));

export function isSupportedLang(code: string | null | undefined): code is Lang {
  return Boolean(code && LANGUAGE_CODES.has(code));
}

export function languageForContent(lang: Lang): 'en' | 'hi' {
  return lang === 'hi' ? 'hi' : 'en';
}
