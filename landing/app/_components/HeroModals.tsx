"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import {
  CheckCircle,
  PhoneCall,
  SealCheck,
  UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import { appStrings, mockIsDeva } from "../_lib/appStrings";
import { useLang } from "../_lib/lang";

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Four app moments as tiles wearing the amphi idea-box treatment, dark
 * variant: a deep muted surface, the texture mask blended soft-light and
 * kept drifting, a mono `01 · LABEL` header, a stepped dither cluster in
 * the corner, and content on darker translucent insets. Rich tiles over the
 * pale green hero — the same figure-ground flip the amphi boxes pull on
 * their black page.
 */

function useMock() {
  const { lang } = useLang();
  return {
    s: appStrings(lang),
    deva: mockIsDeva(lang) ? "deva" : "",
    reduce: useReducedMotion(),
  };
}

/** Stepped pixel cluster on a 4px grid — the amphi tiles' corner signature. */
function DitherCorner() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="currentColor"
      aria-hidden="true"
      className="absolute top-5 right-5 opacity-70"
    >
      <rect x="20" y="20" width="8" height="8" />
      <rect x="16" y="24" width="4" height="4" />
      <rect x="24" y="16" width="4" height="4" />
      <rect x="16" y="16" width="4" height="4" />
      <rect x="8" y="24" width="4" height="4" />
      <rect x="24" y="8" width="4" height="4" />
    </svg>
  );
}

/* The amphi dark-tile family (olive and plum are its literal dark-theme
   values), extended with a slate and a clay so each of the four moments
   keeps its own hue family from the app's chips. */
const tones = {
  slate: "bg-[#3C4A5C] text-[#E8ECF1]",
  plum: "bg-[#4C3F63] text-[#E9ECF0]",
  clay: "bg-[#5A4437] text-[#F1EAE4]",
  olive: "bg-[#3E5049] text-[#EDEFEA]",
} as const;

/** Rows and panels inside a tile: darker glass, borders from the tile's ink. */
const inset = "rounded-[13px] border border-current/15 bg-black/20";

function ModalCard({
  num,
  label,
  sub,
  tone,
  delay,
  tilt = 0,
  index,
  children,
}: {
  num: string;
  label: string;
  sub?: string;
  tone: keyof typeof tones;
  delay: number;
  tilt?: number;
  index: number;
  children: ReactNode;
}) {
  const { deva } = useMock();
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 28, rotate: 0 }}
      animate={{ opacity: 1, y: 0, rotate: reduce ? 0 : tilt }}
      transition={{ duration: 0.7, delay, ease }}
      whileHover={reduce ? undefined : { y: -6, rotate: 0 }}
      className={`relative overflow-hidden rounded-[22px] p-6 shadow-[0_18px_44px_rgba(10,10,10,0.16)] transition-shadow duration-300 hover:shadow-[0_26px_58px_rgba(10,10,10,0.24)] xl:p-7 ${tones[tone]}`}
    >
      {/* The idea-box ground: texture mask blended soft-light over the deep
          base, drifting slowly enough to read as light, not as a slideshow. */}
      <Image
        src="/textures/idea-mask-2.png"
        alt=""
        aria-hidden
        fill
        sizes="(max-width: 1024px) 100vw, 420px"
        className="ken-burns pointer-events-none object-cover opacity-[0.32] mix-blend-soft-light select-none"
        style={
          {
            "--kb-scale": "1.22",
            "--kb-x": index % 2 ? "-16px" : "16px",
            "--kb-y": index % 2 ? "16px" : "-18px",
            "--kb-duration": `${13 + index * 2}s`,
            "--kb-delay": `${-index * 4}s`,
          } as React.CSSProperties
        }
      />

      <p className={`relative z-10 truncate pr-9 font-mono text-[11.5px] font-medium tracking-[0.2em] uppercase ${deva}`}>
        <span className="opacity-55">{num} · </span>
        {label}
      </p>
      {sub && (
        <p className={`relative z-10 mt-1 text-[13px] font-medium opacity-70 ${deva}`}>
          {sub}
        </p>
      )}
      <div className="relative z-10 mt-4">{children}</div>

      <DitherCorner />
    </motion.div>
  );
}

/** The screenshot moment: a guardian filling in Ma's BP-medicine reminder. */
function ReminderModal({ delay }: { delay: number }) {
  const { s, deva } = useMock();

  const fields = [
    { k: s.reminder.what, v: s.reminder.medicine, devaValue: true },
    { k: s.reminder.when, v: s.reminder.time, devaValue: false },
    { k: s.reminder.repeats, v: s.reminder.daily, devaValue: false },
  ];

  return (
    <ModalCard
      num="01"
      label={s.guardian.title}
      sub={s.guardian.forWhom}
      tone="slate"
      delay={delay}
      tilt={-1.1}
      index={0}
    >
      <dl className={`space-y-2.5 p-4 ${inset}`}>
        {fields.map(({ k, v, devaValue }) => (
          <div key={k} className="flex items-baseline gap-3">
            <dt className={`text-[13px] opacity-60 ${deva}`}>{k}</dt>
            <dd className={`ml-auto text-[15px] font-semibold ${devaValue ? "deva" : deva}`}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <ul className="mt-2.5 grid grid-cols-1 gap-2.5">
        {s.guardian.members.slice(0, 1).map((m) => (
          <li key={m} className={`flex min-w-0 items-center gap-2.5 p-3 ${inset}`}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-chip-sage text-chip-sageink">
              <UserCircle size={18} weight="fill" />
            </span>
            <span className={`min-w-0 truncate text-[14px] font-semibold ${deva}`}>{m}</span>
            <PhoneCall size={15} className="ml-auto shrink-0 opacity-60" />
          </li>
        ))}
      </ul>
      <p className={`mt-2.5 rounded-[13px] border border-current/15 bg-white/10 px-3.5 py-3 text-[13px] leading-snug font-medium ${deva}`}>
        {s.guardian.note}
      </p>
    </ModalCard>
  );
}

/** Today's list, half done — the parent's own view of the same reminders. */
function TodayModal({ delay }: { delay: number }) {
  const { s, deva, reduce } = useMock();

  const rows = [
    { label: s.today.walk, time: s.today.morning, done: true },
    { label: s.reminder.medicine, time: s.today.due, done: true },
    { label: s.today.call, time: s.today.evening, done: false },
  ];

  return (
    <ModalCard
      num="02"
      label={s.today.title}
      tone="plum"
      delay={delay}
      tilt={1}
      index={1}
    >
      <ul className="space-y-2.5">
        {rows.map((r, i) => (
          <li key={r.label} className={`flex items-center gap-3 p-3 ${inset}`}>
            <motion.span
              initial={reduce ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: delay + 0.4 + i * 0.18, ease }}
              className={`grid size-7 shrink-0 place-items-center rounded-full ${
                r.done
                  ? "bg-chip-sage text-chip-sageink"
                  : "border border-current/30 opacity-70"
              }`}
            >
              {r.done && <CheckCircle size={18} weight="fill" />}
            </motion.span>
            <span className={`min-w-0 truncate text-[15px] font-semibold ${deva}`}>
              {r.label}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[11.5px] opacity-65">
              {r.time}
            </span>
          </li>
        ))}
      </ul>
    </ModalCard>
  );
}

/** Verified medical listings — categories and institutions, never named people. */
function DoctorsModal({ delay }: { delay: number }) {
  const { s, deva } = useMock();

  return (
    <ModalCard
      num="03"
      label={s.doctors.title}
      tone="clay"
      delay={delay}
      tilt={0.9}
      index={2}
    >
      <ul className="space-y-2.5">
        {s.doctors.rows.map((d) => (
          <li key={d.name} className={`flex min-w-0 items-center gap-3 p-3 ${inset}`}>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[14.5px] font-semibold ${deva}`}>
                {d.name}
              </span>
              <span className="mt-1 flex items-center gap-1.5 truncate text-[11.5px] whitespace-nowrap opacity-70">
                <SealCheck size={13} weight="fill" className="shrink-0" />
                <span className={deva}>{s.services.verified}</span>
                <span aria-hidden>·</span>
                <span className={`truncate ${deva}`}>{d.area}</span>
              </span>
            </span>
            <PhoneCall size={16} className="shrink-0 opacity-60" />
          </li>
        ))}
      </ul>
    </ModalCard>
  );
}

/** The errand the app absorbs: one call and the groceries arrive. */
function GroceryModal({ delay }: { delay: number }) {
  const { s, deva } = useMock();

  return (
    <ModalCard
      num="04"
      label={s.grocery.title}
      tone="olive"
      delay={delay}
      tilt={-0.8}
      index={3}
    >
      <div className={`flex min-w-0 items-center gap-3 p-3 ${inset}`}>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14.5px] font-semibold ${deva}`}>
            {s.grocery.store}
          </span>
          <span className={`mt-0.5 block truncate text-[11.5px] opacity-70 ${deva}`}>
            {s.grocery.area}
          </span>
        </span>
      </div>
      <span
        className={`mt-3 flex items-center justify-center gap-2 rounded-full bg-chip-sage px-4 py-3 text-[14px] font-semibold text-chip-sageink ${deva}`}
      >
        <PhoneCall size={17} weight="fill" />
        {s.grocery.call}
      </span>
    </ModalCard>
  );
}

export function HeroModals() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
      {/* Two independent columns instead of one grid: the cards keep their own
          heights, so the collage staggers naturally instead of stretching every
          card to its row's tallest neighbour. */}
      <div className="flex flex-col gap-4 sm:gap-5">
        <ReminderModal delay={0.1} />
        <GroceryModal delay={0.34} />
      </div>
      <div className="flex flex-col gap-4 sm:mt-10 sm:gap-5">
        <TodayModal delay={0.22} />
        <DoctorsModal delay={0.46} />
      </div>
    </div>
  );
}
