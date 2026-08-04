"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import {
  BellRinging,
  Microphone,
  Phone,
  SealCheck,
} from "@phosphor-icons/react/dist/ssr";
import { CITIES, TOTAL_LISTINGS } from "../_lib/copy";
import { useLang } from "../_lib/lang";
import { AppMockup } from "./mockups/AppMockup";

const ease = [0.16, 1, 0.3, 1] as const;

const cell =
  "relative flex flex-col overflow-hidden rounded-[18px] border border-line bg-paper/90 p-5 shadow-[0_10px_28px_rgba(10,10,10,0.05)] backdrop-blur-sm";

function enter(delay: number, reduce: boolean | null) {
  return {
    initial: reduce ? false : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease },
  };
}

function Chip({
  tone,
  children,
}: {
  tone: "sky" | "sage" | "emergency";
  children: React.ReactNode;
}) {
  const tones = {
    sky: "bg-chip-sky text-chip-skyink",
    sage: "bg-chip-sage text-chip-sageink",
    emergency: "bg-emergency text-paper",
  } as const;
  return (
    <span className={`grid size-9 shrink-0 place-items-center rounded-full ${tones[tone]}`}>
      {children}
    </span>
  );
}

/**
 * A phone-shaped phone: bezel, notch, 9:19.5. The mock-up inside is the
 * product's real UI, so giving it the device's real proportions costs nothing
 * and stops it reading as a floating rectangle of app.
 */
function PhoneCell({ delay }: { delay: number }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      {...enter(delay, reduce)}
      className="col-span-2 row-span-3 flex min-h-0 flex-col"
    >
      <div className="relative flex min-h-0 grow flex-col">
        <AppMockup
          className="min-h-0 grow drop-shadow-[0_18px_40px_rgba(10,10,10,0.14)]"
          rounded="rounded-[24px]"
        />
      </div>
    </motion.div>
  );
}

/** The directory, broken down by the three shipped datasets. */
function DirectoryCell({ delay }: { delay: number }) {
  const { t, deva } = useLang();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [shown, setShown] = useState(reduce ? TOTAL_LISTINGS : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, TOTAL_LISTINGS, {
      duration: 1.4,
      delay: delay + 0.2,
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, reduce, delay]);

  const widest = Math.max(...CITIES.map((c) => c.total));

  return (
    <motion.div {...enter(delay, reduce)} ref={ref} className={`${cell} col-span-2 sm:col-span-4`}>
      <div className="flex items-center gap-3">
        <Chip tone="sage">
          <SealCheck size={18} weight="fill" />
        </Chip>
        <span className="flex items-baseline gap-2">
          <span className="text-[30px] leading-none font-bold tracking-[-0.04em] tabular-nums">
            {shown}
          </span>
          <span className={`text-[14px] font-semibold ${deva}`}>
            {t.hero.cards.listingsLabel}
          </span>
        </span>
      </div>

      {/* Bars are the real ratios between the three datasets, not a shape drawn
          to look balanced. Ahilyanagar is genuinely the smallest. */}
      <ul className="mt-4 grid grid-cols-3 gap-x-4 gap-y-1">
        {CITIES.map((c, i) => (
          <li key={c.key}>
            <div className="flex items-baseline justify-between gap-1">
              <span className={`truncate text-[11.5px] font-medium ${deva}`}>
                {t.cities[c.key]}
              </span>
              <span className="shrink-0 text-[11.5px] font-semibold tabular-nums">
                {c.total}
              </span>
            </div>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-paper-tint">
              <motion.span
                className="block h-full rounded-full bg-ink"
                initial={reduce ? false : { width: 0 }}
                animate={inView ? { width: `${(c.total / widest) * 100}%` } : {}}
                transition={{ duration: 0.8, delay: delay + 0.35 + i * 0.1, ease }}
              />
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/** The assistant, with the sentence it is built to understand. */
function AssistantCell({ delay }: { delay: number }) {
  const { t, deva } = useLang();
  const reduce = useReducedMotion();

  return (
    <motion.div {...enter(delay, reduce)} className={`${cell} col-span-2`}>
      <Chip tone="sky">
        <Microphone size={18} weight="fill" />
      </Chip>
      <p className={`mt-3 text-[15px] font-semibold ${deva}`}>
        {t.hero.cards.assistantLabel}
      </p>
      <p
        lang="hi"
        className="deva mt-auto truncate text-[12.5px] text-ink-subtle"
        title="मुझे रोज़ शाम 8 बजे बीपी की दवा याद दिलाना"
      >
        “मुझे रोज़ शाम 8 बजे…”
      </p>
    </motion.div>
  );
}

/** Reminders, shown as the card the assistant produces. */
function RemindersCell({ delay }: { delay: number }) {
  const { t, deva } = useLang();
  const reduce = useReducedMotion();

  return (
    <motion.div {...enter(delay, reduce)} className={`${cell} col-span-2`}>
      <Chip tone="sage">
        <BellRinging size={18} weight="fill" />
      </Chip>
      <p className={`mt-3 text-[15px] font-semibold ${deva}`}>
        {t.hero.cards.remindersLabel}
      </p>
      <p className={`mt-auto text-[12.5px] text-ink-subtle ${deva}`}>
        {t.hero.cards.remindersNote}
      </p>
    </motion.div>
  );
}

/** The page's only red, and its only infinite loop. */
function SosCell({ delay }: { delay: number }) {
  const { t, deva } = useLang();
  const reduce = useReducedMotion();

  return (
    <motion.div
      {...enter(delay, reduce)}
      className={`${cell} col-span-2 border-emergency/20 bg-emergency-soft sm:col-span-4`}
    >
      <span className="relative w-fit">
        <Chip tone="emergency">
          <Phone size={17} weight="fill" />
        </Chip>
        {!reduce && (
          <motion.span
            className="absolute inset-0 rounded-full"
            animate={{
              boxShadow: [
                "0 0 0 0 rgba(225,25,0,0.35)",
                "0 0 0 14px rgba(225,25,0,0)",
              ],
            }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </span>
      <p className="mt-3 text-[18px] font-bold text-emergency">SOS 112</p>
      <p className={`mt-auto text-[12.5px] leading-snug text-ink-muted ${deva}`}>
        {t.hero.cards.sosNote}
      </p>
    </motion.div>
  );
}

export function HeroBento() {
  return (
    <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-6 sm:gap-4">
      <PhoneCell delay={0.1} />
      <DirectoryCell delay={0.18} />
      <AssistantCell delay={0.26} />
      <RemindersCell delay={0.3} />
      <SosCell delay={0.34} />
    </div>
  );
}
