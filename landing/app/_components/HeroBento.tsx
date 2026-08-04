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
import { TOTAL_LISTINGS } from "../_lib/copy";
import { useLang } from "../_lib/lang";

const SHOTS = [
  "/shots/home.png",
  "/shots/assistant.png",
  "/shots/calendar.png",
  "/shots/community.png",
];

const HOLD_MS = 2800;
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
    <motion.div {...enter(delay, reduce)} className={`${cell} col-span-2 h-[236px]`}>
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
  const { t } = useLang();
  const reduce = useReducedMotion();
  const screens = t.hero.screens;
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (reduce || !auto) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % SHOTS.length), HOLD_MS);
    return () => clearInterval(id);
  }, [reduce, auto]);

  return (
    <motion.div
      {...enter(delay, reduce)}
      // Spans both rows and takes its height from them, so the phone always
      // ends flush with the two cards beside it instead of being pinned to a
      // guessed pixel height that drifts when the copy rewraps.
      className={`${cell} row-span-2 flex h-full flex-col bg-paper-alt p-3`}
    >
      <div className="relative w-full grow overflow-hidden rounded-[12px] border border-line bg-paper">
        {/* All four stay mounted and cross-fade, so no frame arrives unloaded. */}
        {SHOTS.map((src, i) => (
          <motion.div
            key={src}
            className="absolute inset-0"
            initial={false}
            animate={{ opacity: i === index ? 1 : 0, scale: i === index ? 1 : 1.02 }}
            transition={{ duration: reduce ? 0 : 0.7, ease }}
            aria-hidden={i !== index}
          >
            <Image
              src={src}
              alt={screens[i].alt}
              fill
              priority={i === 0}
              sizes="240px"
              className="object-cover object-top"
            />
          </motion.div>
        ))}
      </div>

      <div className="mt-3 flex shrink-0 justify-center gap-1.5">
        {screens.map((s, i) => (
          <button
            key={s.label}
            type="button"
            aria-label={s.label}
            aria-current={i === index}
            onClick={() => {
              setIndex(i);
              setAuto(false);
            }}
            className="group grid h-6 w-7 place-items-center"
          >
            <span
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === index ? "w-5 bg-ink" : "w-1.5 bg-ink/25 group-hover:bg-ink/50"
              }`}
            />
          </button>
        ))}
      </div>
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

  return (
    <motion.div {...enter(delay, reduce)} ref={ref} className={`${cell} h-[152px] p-5`}>
      <p className="text-[38px] leading-none font-bold tracking-[-0.04em] tabular-nums">
        {shown}
      </p>
      <p className={`mt-1.5 text-[15px] font-semibold ${deva}`}>
        {t.hero.cards.listingsLabel}
      </p>
      <p className={`mt-1 text-[13px] leading-snug text-ink-subtle ${deva}`}>
        {t.hero.cards.listingsNote}
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
      className={`${cell} h-[152px] border-emergency/20 bg-emergency-soft p-5`}
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
      <p className="mt-4 text-[19px] font-bold text-emergency">SOS 112</p>
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
