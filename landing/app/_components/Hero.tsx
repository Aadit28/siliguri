"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  const reduce = useReducedMotion();
  const rise = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease },
  });

  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-12 px-5 pt-14 pb-20 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:pt-20 lg:pb-28">
        <div className="lg:col-span-6 xl:col-span-5">
          <motion.p
            {...rise(0)}
            className="text-[13px] font-medium tracking-[0.14em] text-ink-subtle uppercase"
          >
            Pilot city · Siliguri, West Bengal
          </motion.p>

          <motion.h1
            {...rise(0.08)}
            className="mt-5 text-[38px] leading-[1.06] font-bold tracking-[-0.035em] text-balance sm:text-[46px] lg:text-[52px]"
          >
            Care for your parents in Siliguri, from anywhere.
          </motion.h1>

          <motion.p
            {...rise(0.16)}
            className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-ink-muted sm:text-lg"
          >
            Verified local services, reminders that ring, and an assistant that
            answers in Hindi.
          </motion.p>

          <motion.div {...rise(0.24)} className="mt-8 flex flex-wrap gap-3">
            <a
              href="#waitlist"
              className="inline-flex h-14 items-center rounded-full bg-ink px-7 text-[16px] font-semibold text-paper transition-transform hover:bg-black active:translate-y-px"
            >
              Get early access
            </a>
            <a
              href="#how"
              className="inline-flex h-14 items-center rounded-full border border-line bg-paper px-7 text-[16px] font-semibold text-ink transition-colors hover:bg-paper-alt active:translate-y-px"
            >
              See how it works
            </a>
          </motion.div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease }}
          className="relative lg:col-span-6 lg:col-start-7 xl:col-span-7"
        >
          <div className="relative aspect-4/3 w-full overflow-hidden rounded-[20px] bg-paper-alt">
            <Image
              src="/care-siliguri.png"
              alt="A daughter showing her father something on a phone at home in Siliguri"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 640px"
              className="object-cover object-[62%_center]"
            />
          </div>

          {/* Real app screen, not a drawn mock-up. */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35, ease }}
            className="absolute -bottom-8 -left-4 hidden w-[186px] overflow-hidden rounded-[22px] border-[6px] border-ink bg-paper shadow-[0_20px_50px_rgba(10,10,10,0.22)] sm:block lg:-left-8 lg:w-[212px]"
          >
            <Image
              src="/shots/home.png"
              alt="The Saathi home screen, asking what you need today"
              width={390}
              height={844}
              sizes="212px"
              className="h-auto w-full"
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
