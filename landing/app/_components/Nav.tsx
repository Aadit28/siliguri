"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "./Wordmark";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#directory", label: "Directory" },
  { href: "#access", label: "Accessibility" },
];

export function Nav() {
  // Border and blur only appear once the page has moved, so the hero opens
  // against clean paper.
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        // Solid rather than translucent: the page has one dark section, and a
        // semi-transparent bar over it reads as a grey smear.
        scrolled
          ? "border-b border-line bg-paper"
          : "border-b border-transparent bg-paper"
      }`}
    >
      <nav className="mx-auto flex h-[68px] max-w-[1240px] items-center gap-6 px-5 sm:px-8">
        <a href="#top" className="shrink-0" aria-label="Saathi, top of page">
          <Wordmark />
        </a>

        <span className="deva ml-1 hidden rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-ink-subtle lg:inline">
          हिंदी first
        </span>

        <div className="ml-auto hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[15px] font-medium text-ink-muted transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </div>

        <a
          href="#waitlist"
          className="ml-auto inline-flex h-11 items-center rounded-full bg-ink px-5 text-[15px] font-semibold text-paper transition-transform hover:bg-black active:translate-y-px md:ml-0"
        >
          Get early access
        </a>
      </nav>
    </header>
  );
}
