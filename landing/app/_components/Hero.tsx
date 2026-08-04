"use client";

import { motion, useReducedMotion } from "motion/react";
import { useLang } from "../_lib/lang";
import { HeroBento } from "./HeroBento";

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  const { t, deva } = useLang();
  const h = t.hero;
  const reduce = useReducedMotion();

  const rise = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease },
  });

  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-12 px-5 pt-12 pb-20 sm:px-8 lg:grid-cols-12 lg:gap-12 lg:pt-16 lg:pb-24">
        <div className="lg:col-span-5">
          <motion.p
            {...rise(0)}
            className={`text-[13px] font-medium tracking-[0.14em] text-ink-subtle uppercase ${deva}`}
          >
            {h.eyebrow}
          </motion.p>

          <motion.h1
            {...rise(0.08)}
            className={`mt-5 text-[36px] leading-[1.08] font-bold tracking-[-0.035em] text-balance sm:text-[44px] lg:text-[48px] ${deva}`}
          >
            {h.headline}
          </motion.h1>

          <motion.p
            {...rise(0.16)}
            className={`mt-5 max-w-[44ch] text-[17px] leading-relaxed text-ink-muted ${deva}`}
          >
            {h.sub}
          </motion.p>

          <motion.div {...rise(0.24)} className="mt-8 flex flex-wrap gap-3">
            <a
              href="#waitlist"
              className={`inline-flex h-14 items-center rounded-full bg-ink px-7 text-[16px] font-semibold text-paper transition-transform hover:bg-black active:translate-y-px ${deva}`}
            >
              {h.ctaPrimary}
            </a>
            <a
              href="#how"
              className={`inline-flex h-14 items-center rounded-full border border-line bg-paper px-7 text-[16px] font-semibold text-ink transition-colors hover:bg-paper-alt active:translate-y-px ${deva}`}
            >
              {h.ctaSecondary}
            </a>
          </motion.div>
        </div>

        <div className="lg:col-span-7">
          <HeroBento />
        </div>
      </div>
    </section>
  );
}
