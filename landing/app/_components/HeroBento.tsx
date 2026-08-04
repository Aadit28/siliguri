"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Phone } from "@phosphor-icons/react/dist/ssr";
import { CITIES, TOTAL_LISTINGS } from "../_lib/copy";
import { useLang } from "../_lib/lang";
import { AppMockup } from "./mockups/AppMockup";

const ease = [0.16, 1, 0.3, 1] as const;

const cell =
  "relative overflow-hidden rounded-[18px] border border-line bg-paper";

function enter(delay: number, reduce: boolean | null) {
  return {
    initial: reduce ? false : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease },
  };
}

/** The photo, drifting slightly against the pointer. */
function PhotoCell({
  x,
  y,
  delay,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  delay: number;
}) {
  const { t } = useLang();
  const reduce = useReducedMotion();
  return (
    <motion.div {...enter(delay, reduce)} className={`${cell} col-span-2 h-[220px] lg:h-[286px]`}>
      <motion.div style={reduce ? undefined : { x, y }} className="absolute -inset-4">
        <Image
          src="/care-siliguri.png"
          alt={t.hero.photoAlt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 660px"
          className="object-cover object-[60%_38%]"
        />
      </motion.div>
    </motion.div>
  );
}

/**
 * Four real app screens on a loop. One screenshot makes Saathi look like a
 * directory; the cycle shows it is a directory, an assistant, a calendar and a
 * neighbours' board without spending hero copy saying so. The dots are real
 * controls, and taking one stops the auto-play.
 */
function PhoneCell({ delay }: { delay: number }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      {...enter(delay, reduce)}
      // Spans both rows and takes its height from them, so the phone always
      // ends flush with the two cards beside it instead of being pinned to a
      // guessed pixel height that drifts when the copy rewraps.
      className={`${cell} row-span-2 flex h-full flex-col bg-paper-alt p-3`}
    >
      <AppMockup className="grow" />
    </motion.div>
  );
}

/** Counts up to the real total across the three shipped datasets. */
function ListingsCell({ delay }: { delay: number }) {
  const { t, deva } = useLang();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
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
    <motion.div
      {...enter(delay, reduce)}
      ref={ref}
      className={`${cell} flex h-[196px] flex-col p-5 lg:h-[236px] lg:p-6`}
    >
      <div className="flex items-baseline gap-2">
        <p className="text-[38px] leading-none font-bold tracking-[-0.04em] tabular-nums lg:text-[46px]">
          {shown}
        </p>
        <p className={`text-[14px] font-semibold ${deva}`}>
          {t.hero.cards.listingsLabel}
        </p>
      </div>

      {/* Bars are the real proportions between the three datasets, not a shape
          drawn to look balanced. Ahilyanagar is genuinely the smallest. */}
      {/* Label and bar stack rather than sit side by side: in a third-width
          card an inline label leaves the bar too short to compare against. */}
      <ul className="mt-auto space-y-2.5">
        {CITIES.map((c, i) => (
          <li key={c.key}>
            <div className="flex items-baseline justify-between gap-2">
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

/** The page's only red, and its only infinite loop. */
function SosCell({ delay }: { delay: number }) {
  const { t, deva } = useLang();
  const reduce = useReducedMotion();

  return (
    <motion.div
      {...enter(delay, reduce)}
      className={`${cell} flex h-[196px] flex-col border-emergency/20 bg-emergency-soft p-5 lg:h-[236px] lg:p-6`}
    >
      <span className="relative grid size-10 place-items-center rounded-full bg-emergency text-paper">
        <Phone size={18} weight="fill" />
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
      <p className="mt-auto text-[24px] font-bold text-emergency lg:text-[28px]">SOS 112</p>
      <p className={`mt-1 text-[13px] leading-snug text-ink-muted ${deva}`}>
        {t.hero.cards.sosNote}
      </p>
    </motion.div>
  );
}

export function HeroBento() {
  const reduce = useReducedMotion();

  // Pointer drives the drift through motion values, never state: state here
  // would re-render the whole grid on every mousemove and stutter the
  // cross-fade running inside the phone.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 110, damping: 20, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 110, damping: 20, mass: 0.6 });
  const photoX = useTransform(sx, [0, 1], [14, -14]);
  const photoY = useTransform(sy, [0, 1], [10, -10]);

  return (
    <div
      onPointerMove={(event) => {
        // Coarse pointers get no drift: on a phone the "pointer" is a tap, and
        // shifting on tap reads as a glitch.
        if (reduce || event.pointerType !== "mouse") return;
        const box = event.currentTarget.getBoundingClientRect();
        px.set((event.clientX - box.left) / box.width);
        py.set((event.clientY - box.top) / box.height);
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
    >
      <PhotoCell x={photoX} y={photoY} delay={0.1} />
      <PhoneCell delay={0.18} />
      <ListingsCell delay={0.26} />
      <SosCell delay={0.34} />
    </div>
  );
}
