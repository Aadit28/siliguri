"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { Phone, SealCheck } from "@phosphor-icons/react/dist/ssr";
import { CITIES, TOTAL_LISTINGS } from "../_lib/copy";
import { useLang } from "../_lib/lang";
import { AppMockup } from "./mockups/AppMockup";

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Stepped pixel cluster on a 4px grid, lifted from the amphi landing's idea
 * tiles. The one piece of pure decoration on the page; it earns its place by
 * marking a tile as a tile.
 */
function DitherCorner({ fill }: { fill: string }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className="absolute top-4 right-4 opacity-70"
    >
      <rect x="20" y="20" width="8" height="8" fill={fill} />
      <rect x="16" y="24" width="4" height="4" fill={fill} />
      <rect x="24" y="16" width="4" height="4" fill={fill} />
      <rect x="16" y="16" width="4" height="4" fill={fill} />
      <rect x="8" y="24" width="4" height="4" fill={fill} />
      <rect x="24" y="8" width="4" height="4" fill={fill} />
    </svg>
  );
}

const tones = {
  // Pastel green is the app's own sage chip colour, promoted from the icon slot
  // to a tile surface. Its dark green ink stays well clear of AA on that tint.
  sage: "bg-chip-sage text-chip-sageink border-chip-sageink/15",
  paper: "bg-paper/90 text-ink border-line",
  emergency: "bg-emergency-soft text-ink border-emergency/20",
} as const;

const ditherFill = {
  sage: "#2e5d3c",
  paper: "#0a0a0a",
  emergency: "#e11900",
} as const;

function Tile({
  num,
  tag,
  tone,
  span,
  delay,
  index,
  children,
}: {
  num: string;
  tag: string;
  tone: keyof typeof tones;
  span: string;
  delay: number;
  index: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      data-tile
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease }}
      whileHover={reduce ? undefined : { y: -6 }}
      className={`relative flex flex-col overflow-hidden rounded-[18px] border p-5 shadow-[0_10px_28px_rgba(10,10,10,0.05)] transition-shadow duration-300 hover:shadow-[0_18px_44px_rgba(10,10,10,0.12)] lg:p-6 xl:p-7 ${tones[tone]} ${span}`}
    >
      {/* Texture on the green tiles only: the same mask and blend the amphi
          tiles use, so the pastel reads as a surface rather than a flat fill. */}
      {tone === "sage" && (
        <Image
          src="/textures/tile-mask.png"
          alt=""
          aria-hidden
          fill
          sizes="(max-width: 1024px) 100vw, 460px"
          className="ken-burns pointer-events-none object-cover opacity-[0.22] mix-blend-overlay select-none"
          style={
            {
              "--kb-scale": "1.2",
              "--kb-x": index % 2 ? "-14px" : "14px",
              "--kb-y": index % 2 ? "14px" : "-16px",
              "--kb-duration": `${15 + index * 2}s`,
              "--kb-delay": `${-index * 4}s`,
            } as React.CSSProperties
          }
        />
      )}

      <p className="relative z-10 pr-9 font-mono text-[10.5px] font-medium tracking-[0.18em] uppercase">
        <span className="opacity-55">{num} · </span>
        {tag}
      </p>

      <div className="relative z-10 flex grow flex-col">{children}</div>

      <DitherCorner fill={ditherFill[tone]} />
    </motion.div>
  );
}

/** Inset panel, inheriting its tile's ink through currentColor. */
function Inset({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div data-inset className="mt-auto rounded-[12px] border border-current/15 bg-current/[0.06] p-3 backdrop-blur-[2px]">
      <p className="font-mono text-[9.5px] tracking-[0.16em] uppercase opacity-60">
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function PhoneCell({ delay }: { delay: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease }}
      className="col-span-2 flex min-h-0 flex-col sm:col-span-3 sm:row-span-3"
    >
      <AppMockup
        className="min-h-0 grow drop-shadow-[0_18px_40px_rgba(10,10,10,0.14)]"
        rounded="rounded-[24px]"
      />
    </motion.div>
  );
}

function DirectoryTile({ delay }: { delay: number }) {
  const { t, deva } = useLang();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
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
    <Tile
      num="01"
      tag={t.hero.cards.tags.directory}
      tone="sage"
      index={0}
      delay={delay}
      span="col-span-2 sm:col-span-4"
    >
      <div ref={ref} className="mt-4 flex items-center gap-3">
        <SealCheck size={26} weight="fill" className="shrink-0 opacity-80" />
        <span className="flex items-baseline gap-2">
          <span data-figure className="text-[34px] leading-none font-bold tracking-[-0.04em] tabular-nums xl:text-[42px]">
            {shown}
          </span>
          <span className={`text-[16px] font-semibold xl:text-[18px] ${deva}`}>
            {t.hero.cards.listingsLabel}
          </span>
        </span>
      </div>

      {/* Bars are the real ratios between the three shipped datasets, not a
          shape drawn to look balanced. Ahilyanagar is genuinely the smallest. */}
      <ul className="mt-auto grid grid-cols-3 gap-x-4 pt-4">
        {CITIES.map((c, i) => (
          <li key={c.key}>
            <div className="flex items-baseline justify-between gap-1">
              <span className={`truncate text-[13px] font-medium ${deva}`}>
                {t.cities[c.key]}
              </span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                {c.total}
              </span>
            </div>
            <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-current/15">
              <motion.span
                className="block h-full rounded-full bg-current"
                initial={reduce ? false : { width: 0 }}
                animate={inView ? { width: `${(c.total / widest) * 100}%` } : {}}
                transition={{ duration: 0.8, delay: delay + 0.35 + i * 0.1, ease }}
              />
            </span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

function AssistantTile({ delay }: { delay: number }) {
  const { t, deva } = useLang();
  return (
    <Tile
      num="02"
      tag={t.hero.cards.tags.assistant}
      tone="paper"
      index={1}
      delay={delay}
      span="col-span-2"
    >
      <p className={`mt-4 text-[17px] leading-snug font-semibold xl:text-[19px] ${deva}`}>
        {t.hero.cards.assistantLabel}
      </p>
      <Inset label="hi-IN">
        {/* Always Hindi: this is the sentence a parent actually says. */}
        <p lang="hi" className="deva truncate text-[13px] leading-snug">
          “मुझे रोज़ शाम 8 बजे…”
        </p>
      </Inset>
    </Tile>
  );
}

function RemindersTile({ delay }: { delay: number }) {
  const { t, deva } = useLang();
  return (
    <Tile
      num="03"
      tag={t.hero.cards.tags.reminders}
      tone="sage"
      index={2}
      delay={delay}
      span="col-span-2"
    >
      <p className={`mt-4 text-[17px] leading-snug font-semibold xl:text-[19px] ${deva}`}>
        {t.hero.cards.remindersLabel}
      </p>
      <Inset label="8:00 PM">
        <p className={`text-[13px] leading-snug ${deva}`}>
          {t.hero.cards.remindersNote}
        </p>
      </Inset>
    </Tile>
  );
}

/** The page's only red, and its only pulsing loop. */
function SosTile({ delay }: { delay: number }) {
  const { t, deva } = useLang();
  const reduce = useReducedMotion();

  return (
    <Tile
      num="04"
      tag={t.hero.cards.tags.sos}
      tone="emergency"
      index={3}
      delay={delay}
      span="col-span-2 sm:col-span-4"
    >
      <div className="mt-4 flex items-center gap-4">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-emergency text-paper">
          <Phone size={20} weight="fill" />
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
        <span>
          <span className="block text-[22px] leading-none font-bold text-emergency xl:text-[26px]">
            SOS 112
          </span>
          <span className={`mt-1.5 block text-[14px] leading-snug text-ink-muted ${deva}`}>
            {t.hero.cards.sosNote}
          </span>
        </span>
      </div>
    </Tile>
  );
}

export function HeroBento() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-7 sm:gap-4">
      <PhoneCell delay={0.1} />
      <DirectoryTile delay={0.18} />
      <AssistantTile delay={0.26} />
      <RemindersTile delay={0.3} />
      <SosTile delay={0.34} />
    </div>
  );
}
