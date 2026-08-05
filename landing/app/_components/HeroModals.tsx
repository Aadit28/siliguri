"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowsClockwise,
  Basket,
  BellRinging,
  CheckCircle,
  Clock,
  PhoneCall,
  SealCheck,
  Stethoscope,
  Sun,
  UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import { appStrings, mockIsDeva } from "../_lib/appStrings";
import { useLang } from "../_lib/lang";
import { chipTone } from "./mockups/Device";

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * The hero used to hold the full role-switching mock-up; that now anchors the
 * "one app, three people" section, and the hero instead shows the app's
 * moments as a spread of small modal cards — a reminder being set, today's
 * list, the doctors nearby, the grocery call. Four different tasks read faster
 * than one screen, and each card is small enough to be understood before the
 * eye moves on.
 */
function useMock() {
  const { lang } = useLang();
  return {
    s: appStrings(lang),
    deva: mockIsDeva(lang) ? "deva" : "",
    reduce: useReducedMotion(),
  };
}

function ModalCard({
  icon,
  tone,
  title,
  sub,
  delay,
  tilt = 0,
  children,
}: {
  icon: ReactNode;
  tone: keyof typeof chipTone;
  title: string;
  sub?: string;
  delay: number;
  tilt?: number;
  children: ReactNode;
}) {
  const { deva } = useMock();
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 26, rotate: 0 }}
      animate={{ opacity: 1, y: 0, rotate: reduce ? 0 : tilt }}
      transition={{ duration: 0.7, delay, ease }}
      whileHover={reduce ? undefined : { y: -5, rotate: 0 }}
      className="rounded-[18px] border border-line bg-paper p-4 shadow-[0_14px_34px_rgba(10,10,10,0.09)] transition-shadow duration-300 hover:shadow-[0_20px_46px_rgba(10,10,10,0.14)]"
    >
      <div className="flex items-center gap-2.5">
        <span className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${chipTone[tone]}`}>
          {icon}
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-[15px] leading-tight font-bold tracking-[-0.01em] ${deva}`}>
            {title}
          </span>
          {sub && (
            <span className={`block truncate text-[12px] text-ink-subtle ${deva}`}>
              {sub}
            </span>
          )}
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </motion.div>
  );
}

/** The screenshot moment: a guardian filling in Ma's BP-medicine reminder. */
function ReminderModal({ delay }: { delay: number }) {
  const { s, deva } = useMock();

  const fields = [
    { icon: BellRinging, k: s.reminder.what, v: s.reminder.medicine, devaValue: true },
    { icon: Clock, k: s.reminder.when, v: s.reminder.time, devaValue: false },
    { icon: ArrowsClockwise, k: s.reminder.repeats, v: s.reminder.daily, devaValue: false },
  ];

  return (
    <ModalCard
      icon={<BellRinging size={18} />}
      tone="sky"
      title={s.guardian.title}
      sub={s.guardian.forWhom}
      delay={delay}
      tilt={-1.1}
    >
      <dl className="space-y-2 rounded-[12px] border border-line p-3">
        {fields.map(({ icon: Icon, k, v, devaValue }) => (
          <div key={k} className="flex items-center gap-2.5">
            <Icon size={15} className="shrink-0 text-ink-subtle" />
            <dt className={`text-[12.5px] text-ink-subtle ${deva}`}>{k}</dt>
            <dd className={`ml-auto text-[14px] font-semibold ${devaValue ? "deva" : deva}`}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <ul className="mt-2.5 grid grid-cols-1 gap-2">
        {s.guardian.members.slice(0, 1).map((m) => (
          <li key={m} className="flex min-w-0 items-center gap-2 rounded-[12px] border border-line p-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-chip-sage text-chip-sageink">
              <UserCircle size={16} weight="fill" />
            </span>
            <span className={`min-w-0 truncate text-[13px] font-medium ${deva}`}>{m}</span>
            <PhoneCall size={14} className="ml-auto shrink-0 text-ink-subtle" />
          </li>
        ))}
      </ul>
      <p className={`mt-2.5 rounded-[12px] bg-chip-sky px-3 py-2.5 text-[12.5px] leading-snug text-chip-skyink ${deva}`}>
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
      icon={<Sun size={18} />}
      tone="butter"
      title={s.today.title}
      delay={delay}
      tilt={1}
    >
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.label} className="flex items-center gap-2.5 rounded-[12px] border border-line p-2.5">
            <motion.span
              initial={reduce ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: delay + 0.4 + i * 0.18, ease }}
              className={`grid size-6 shrink-0 place-items-center rounded-full ${
                r.done
                  ? "bg-chip-sage text-chip-sageink"
                  : "border border-line text-ink-subtle"
              }`}
            >
              {r.done && <CheckCircle size={16} weight="fill" />}
            </motion.span>
            <span className={`min-w-0 truncate text-[13.5px] font-semibold ${deva}`}>
              {r.label}
            </span>
            <span className="ml-auto shrink-0 text-[12px] text-ink-subtle">{r.time}</span>
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
      icon={<Stethoscope size={18} />}
      tone="peach"
      title={s.doctors.title}
      delay={delay}
      tilt={0.9}
    >
      <ul className="space-y-2">
        {s.doctors.rows.map((d) => (
          <li key={d.name} className="flex min-w-0 items-center gap-2.5 rounded-[12px] border border-line p-2.5">
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[13.5px] font-semibold ${deva}`}>
                {d.name}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] whitespace-nowrap text-ink-subtle">
                <SealCheck size={12} weight="fill" className="shrink-0 text-chip-sageink" />
                <span className={deva}>{s.services.verified}</span>
                <span aria-hidden>·</span>
                <span className={`truncate ${deva}`}>{d.area}</span>
              </span>
            </span>
            <PhoneCall size={14} className="shrink-0 text-ink-subtle" />
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
      icon={<Basket size={18} />}
      tone="sage"
      title={s.grocery.title}
      delay={delay}
      tilt={-0.8}
    >
      <div className="flex min-w-0 items-center gap-2.5 rounded-[12px] border border-line p-2.5">
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13.5px] font-semibold ${deva}`}>
            {s.grocery.store}
          </span>
          <span className={`mt-0.5 block truncate text-[11.5px] text-ink-subtle ${deva}`}>
            {s.grocery.area}
          </span>
        </span>
      </div>
      <span
        className={`mt-2.5 flex items-center justify-center gap-2 rounded-full bg-chip-sage px-4 py-2.5 text-[13.5px] font-semibold text-chip-sageink ${deva}`}
      >
        <PhoneCall size={16} weight="fill" />
        {s.grocery.call}
      </span>
    </ModalCard>
  );
}

export function HeroModals() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {/* Two independent columns instead of one grid: the cards keep their own
          heights, so the collage staggers naturally instead of stretching every
          card to its row's tallest neighbour. */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <ReminderModal delay={0.1} />
        <GroceryModal delay={0.34} />
      </div>
      <div className="flex flex-col gap-3 sm:mt-8 sm:gap-4">
        <TodayModal delay={0.22} />
        <DoctorsModal delay={0.46} />
      </div>
    </div>
  );
}
