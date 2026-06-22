import React, { createContext, useContext, useState, useCallback } from 'react';
import i18n from '../lib/i18n';

type Lang = 'hi' | 'en';

interface LocaleState {
  lang: Lang;
  toggle: () => void;
  setLang: (l: Lang) => void;
}

const LocaleContext = createContext<LocaleState | undefined>(undefined);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>((i18n.language as Lang) || 'hi');

  const setLang = useCallback((l: Lang) => {
    i18n.changeLanguage(l);
    setLangState(l);
  }, []);

  const toggle = useCallback(() => {
    setLang(i18n.language === 'hi' ? 'en' : 'hi');
  }, [setLang]);

  return (
    <LocaleContext.Provider value={{ lang, toggle, setLang }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
