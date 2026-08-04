"use client";

import { useLang } from "../_lib/lang";
import { Wordmark } from "./Wordmark";

export function Footer() {
  const { t, deva } = useLang();

  const links = [
    { href: "#how", label: t.nav.how },
    { href: "#directory", label: t.nav.directory },
    { href: "#access", label: t.nav.access },
    { href: "#waitlist", label: t.nav.cta },
  ];

  return (
    <footer className="border-t border-line bg-paper-alt">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div>
          <Wordmark />
          <p className={`mt-4 max-w-[40ch] text-[15px] leading-relaxed text-ink-muted ${deva}`}>
            {t.footer.tagline}
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-8 gap-y-3 text-[15px] font-medium text-ink-muted">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`transition-colors hover:text-ink ${deva}`}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="border-t border-line">
        <p className={`mx-auto max-w-[1240px] px-5 py-6 text-[14px] text-ink-subtle sm:px-8 ${deva}`}>
          {t.footer.disclaimer}
        </p>
      </div>
    </footer>
  );
}
