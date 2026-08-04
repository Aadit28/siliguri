"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LANGS, LANG_NAMES, copy, type Lang } from "../_lib/copy";
import { useLang } from "../_lib/lang";
import { Wordmark } from "./Wordmark";

/**
 * Shown once, before anything else, because the page exists in three languages
 * and guessing from the browser locale gets it wrong for exactly the audience
 * this product is for — an Indian parent on a phone whose OS is set to English.
 * The choice is remembered, so this is a first-visit screen, not a nag.
 */
export function LanguageGate() {
  const { needsChoice, setLang } = useLang();
  const reduce = useReducedMotion();
  const firstButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!needsChoice) return;
    const { style } = document.body;
    const previous = style.overflow;
    style.overflow = "hidden";
    firstButton.current?.focus();
    return () => {
      style.overflow = previous;
    };
  }, [needsChoice]);

  return (
    <AnimatePresence>
      {needsChoice && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="language-gate-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-5 backdrop-blur-sm"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          // No dismiss on backdrop or Escape: every string behind this panel is
          // in a language the visitor has not picked yet, so there is nothing
          // useful to dismiss it to.
        >
          <motion.div
            className="w-full max-w-[440px] rounded-[16px] border border-line bg-paper p-7 shadow-[0_30px_80px_rgba(10,10,10,0.28)] sm:p-8"
            initial={reduce ? false : { opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <Wordmark />

            <h1
              id="language-gate-title"
              className="mt-7 text-[26px] leading-[1.15] font-bold tracking-[-0.03em]"
            >
              {copy.en.gate.title}
              <span className="deva block text-ink-subtle">
                {copy.hi.gate.title} · {copy.mr.gate.title}
              </span>
            </h1>

            <div className="mt-7 grid gap-3">
              {LANGS.map((code: Lang, i) => (
                <button
                  key={code}
                  ref={i === 0 ? firstButton : undefined}
                  type="button"
                  lang={code}
                  onClick={() => setLang(code)}
                  className={`flex h-14 items-center justify-between rounded-[10px] border border-line px-5 text-left transition-colors hover:border-brand hover:bg-brand-soft active:translate-y-px ${
                    code === "en" ? "" : "deva"
                  }`}
                >
                  <span className="text-[18px] font-semibold">
                    {LANG_NAMES[code].native}
                  </span>
                  {code !== "en" && (
                    <span className="text-[14px] font-medium text-ink-subtle">
                      {LANG_NAMES[code].latin}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Said plainly, because the landing page speaks three languages and
                the product does not. */}
            <p className="mt-6 text-[14px] leading-relaxed text-ink-subtle">
              {copy.en.gate.appNote}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
