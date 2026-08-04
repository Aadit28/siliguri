"use client";

import { useEffect, useState } from "react";
import { LANGS, LANG_NAMES } from "../_lib/copy";
import { useLang } from "../_lib/lang";
import { Wordmark } from "./Wordmark";

export function Nav() {
  const { t, deva, lang, setLang } = useLang();
  // Border only appears once the page has moved, so the hero opens against
  // clean paper.
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#how", label: t.nav.how },
    { href: "#directory", label: t.nav.directory },
    { href: "#access", label: t.nav.access },
  ];

  return (
    <header
      // Solid rather than translucent: the page has one dark section, and a
      // semi-transparent bar over it reads as a grey smear.
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "border-b border-line bg-paper"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-[68px] max-w-[1240px] items-center gap-5 px-5 sm:px-8">
        <a href="#top" className="shrink-0" aria-label="Saathi">
          <Wordmark />
        </a>

        <div className="ml-auto hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`text-[15px] font-medium text-ink-muted transition-colors hover:text-ink ${deva}`}
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Three languages fit as a segmented control, so the switch costs one
            tap rather than a menu. */}
        <div
          role="group"
          aria-label={t.nav.langLabel}
          className="ml-auto flex shrink-0 items-center rounded-full border border-line p-0.5 lg:ml-0"
        >
          {LANGS.map((code) => (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={lang === code}
              onClick={() => setLang(code)}
              className={`h-9 rounded-full px-3 text-[14px] font-semibold transition-colors ${
                code === "en" ? "" : "deva"
              } ${
                lang === code
                  ? "bg-ink text-paper"
                  : "text-ink-subtle hover:text-ink"
              }`}
            >
              {code === "en" ? "EN" : LANG_NAMES[code].native}
            </button>
          ))}
        </div>

        <a
          href="#waitlist"
          className={`hidden h-11 items-center rounded-full bg-ink px-5 text-[15px] font-semibold text-paper transition-transform hover:bg-black active:translate-y-px sm:inline-flex ${deva}`}
        >
          {t.nav.cta}
        </a>
      </nav>
    </header>
  );
}
