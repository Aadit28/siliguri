"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { copy, isDeva, LANGS, type Dict, type Lang } from "./copy";

const STORAGE_KEY = "saathi.lang";

type Ctx = {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: Dict;
  /** Class to hang on Devanagari copy so it renders in Noto, not DM Sans. */
  deva: string;
  /** True until the visitor has chosen once, which is what opens the gate. */
  needsChoice: boolean;
};

const LangContext = createContext<Ctx | null>(null);

function readStored(): Lang | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return LANGS.includes(raw as Lang) ? (raw as Lang) : null;
  } catch {
    // Private mode or blocked storage: the gate simply asks again next visit.
    return null;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Server and first client paint must agree, so both start on English and the
  // stored choice is applied in an effect rather than during render.
  const [lang, setLangState] = useState<Lang>("en");
  const [needsChoice, setNeedsChoice] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored) setLangState(stored);
    else setNeedsChoice(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    setNeedsChoice(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Choice still applies for this session even if it cannot be persisted.
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t: copy[lang],
      deva: isDeva(lang) ? "deva" : "",
      needsChoice,
    }),
    [lang, setLang, needsChoice],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LanguageProvider>");
  return ctx;
}
