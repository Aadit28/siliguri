"use client";

import { useLang } from "../_lib/lang";
import { Reveal } from "./Reveal";

// Every figure here is a constant in the app's theme file, not a marketing round
// number: font.xs, TAP, and the contrast floor the palette was darkened to hit.
export function Access() {
  const { t, deva } = useLang();

  return (
    <section
      id="access"
      className="scroll-mt-[80px] mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:py-32"
    >
      <Reveal>
        <h2
          className={`max-w-[26ch] text-[32px] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[42px] ${deva}`}
        >
          {t.access.heading}
        </h2>
      </Reveal>

      <dl className="mt-16 grid grid-cols-1 gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
        {t.access.stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.06}>
            <div className="border-t-2 border-ink pt-5">
              <dt
                className={`text-[46px] leading-none font-bold tracking-[-0.04em] ${
                  "deva" in s && s.deva ? "deva" : "tabular-nums"
                }`}
              >
                {s.value}
              </dt>
              <dd className={`mt-4 text-[16px] font-semibold ${deva}`}>{s.label}</dd>
              <dd className={`mt-2 text-[15px] leading-relaxed text-ink-muted ${deva}`}>
                {s.note}
              </dd>
            </div>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}
