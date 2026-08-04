"use client";

import { motion, useReducedMotion } from "motion/react";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
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
    // Full viewport minus the 68px nav, from lg up only. On a phone the two
    // halves stack, so forcing 100dvh there would just add empty space above a
    // hero that is already taller than the screen.
    <section
      id="top"
      className="hero-canvas relative overflow-hidden border-b border-line lg:flex lg:min-h-[calc(100dvh-68px)] lg:items-center"
    >
      <div className="relative z-10 mx-auto grid w-full max-w-[1560px] grid-cols-1 items-center gap-12 px-5 pt-12 pb-20 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:py-8 xl:gap-12 xl:py-12">
        <div className="lg:col-span-6">
          <motion.p
            {...rise(0)}
            className={`text-[13px] font-medium tracking-[0.14em] text-ink-subtle uppercase ${deva}`}
          >
            {h.eyebrow}
          </motion.p>

          <motion.h1
            {...rise(0.08)}
            className={`mt-6 text-[38px] leading-[1.04] font-bold tracking-[-0.04em] text-balance sm:text-[48px] lg:text-[44px] xl:text-[56px] ${deva}`}
          >
            {h.headline}
          </motion.h1>

          <motion.p
            {...rise(0.16)}
            className={`mt-6 max-w-[46ch] text-[18px] leading-relaxed text-ink-muted lg:text-[20px] ${deva}`}
          >
            {h.sub}
          </motion.p>

          <motion.div {...rise(0.24)} className="mt-10 flex flex-wrap gap-3">
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

        <div className="lg:col-span-6">
          <HeroBento />
        </div>
      </div>

      {/* A hero that fills the viewport hides the entire rest of the page. The
          cue is the affordance that says there is one. */}
      <motion.a
        href="#how"
        aria-hidden
        tabIndex={-1}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.1 }}
        className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 text-ink-subtle transition-colors hover:text-ink lg:block"
      >
        <motion.span
          className="block"
          animate={reduce ? undefined : { y: [0, 5, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <CaretDown size={22} weight="bold" />
        </motion.span>
      </motion.a>
    </section>
  );
}
