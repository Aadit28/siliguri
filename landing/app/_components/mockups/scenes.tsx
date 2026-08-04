"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  ArrowsClockwise,
  BellRinging,
  Broom,
  CheckCircle,
  Clock,
  HandHeart,
  Hospital,
  MagnifyingGlass,
  Pill,
  SealCheck,
} from "@phosphor-icons/react/dist/ssr";
import { appStrings, mockIsDeva, SAMPLE_LISTINGS } from "../../_lib/appStrings";
import { useLang } from "../../_lib/lang";
import { chipTone } from "./Device";

const ease = [0.16, 1, 0.3, 1] as const;

const listingIcon = {
  elder: HandHeart,
  hospital: Hospital,
  pharmacy: Pill,
  civic: Broom,
} as const;

/** Children slide up in sequence, the way a list paints in as data arrives. */
function stagger(i: number, reduce: boolean | null, base = 0.18) {
  return {
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay: base + i * 0.12, ease },
  };
}

function useMock() {
  const { lang } = useLang();
  return {
    s: appStrings(lang),
    deva: mockIsDeva(lang) ? "deva" : "",
    reduce: useReducedMotion(),
  };
}

// Sized for a wide panel rather than a 175px phone column: everything here is
// meant to be legible from across a desk, not squinted at.
const shell = "flex h-full flex-col gap-3 p-4 sm:p-5";
const row = "flex items-center gap-3 rounded-[12px] border border-line p-3";

/** Directory search: the query lands, then verified results paint in. */
export function SceneServices() {
  const { s, deva, reduce } = useMock();

  return (
    <div className={shell}>
      <motion.div
        {...stagger(0, reduce, 0.05)}
        className="flex items-center gap-2.5 rounded-[12px] border border-line bg-paper-alt px-3.5 py-3"
      >
        <MagnifyingGlass size={17} className="shrink-0 text-ink-subtle" />
        <span className={`truncate text-[14px] text-ink-subtle ${deva}`}>
          {s.services.search}
        </span>
      </motion.div>

      <ul className="flex flex-col gap-2.5">
        {SAMPLE_LISTINGS.slice(0, 4).map((item, i) => {
          const Icon = listingIcon[item.icon];
          return (
            <motion.li key={item.name} {...stagger(i + 1, reduce)} className={row}>
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-[10px] ${chipTone[item.tone]}`}
              >
                <Icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">
                  {item.name}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] whitespace-nowrap text-ink-subtle">
                  <SealCheck
                    size={13}
                    weight="fill"
                    className="shrink-0 text-chip-sageink"
                  />
                  <span className={deva}>{s.services.verified}</span>
                  <span aria-hidden>·</span>
                  <span className="truncate">{item.area}</span>
                </span>
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

/** The assistant turn: a spoken Hindi line becomes a saved reminder. */
export function SceneAssistant() {
  const { s, deva, reduce } = useMock();

  const fields = [
    { icon: BellRinging, k: s.reminder.what, v: s.reminder.medicine, deva: true },
    { icon: Clock, k: s.reminder.when, v: s.reminder.time, deva: false },
    { icon: ArrowsClockwise, k: s.reminder.repeats, v: s.reminder.daily, deva: false },
  ];

  return (
    <div className={shell}>
      <motion.div
        {...stagger(0, reduce, 0.05)}
        className="flex items-center justify-between"
      >
        <span className={`text-[12.5px] text-ink-subtle ${deva}`}>
          {s.assistant.online}
        </span>
        <span
          className={`rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold ${deva}`}
        >
          {s.assistant.newChat}
        </span>
      </motion.div>

      {/* Always Hindi: this is the sentence the parent actually says. */}
      <motion.p
        {...stagger(1, reduce)}
        lang="hi"
        className="deva ml-auto max-w-[88%] rounded-[14px] rounded-br-[5px] bg-ink px-3.5 py-2.5 text-[15px] leading-snug text-paper"
      >
        मुझे रोज़ शाम 8 बजे बीपी की दवा याद दिलाना
      </motion.p>

      <motion.div
        {...stagger(2, reduce)}
        className="rounded-[14px] rounded-bl-[5px] border border-line p-3.5"
      >
        <p
          className={`font-mono text-[10.5px] tracking-[0.16em] text-ink-subtle uppercase ${deva}`}
        >
          {s.reminder.title}
        </p>
        <dl className="mt-2.5 space-y-2">
          {fields.map(({ icon: Icon, k, v, deva: devaValue }) => (
            <div key={k} className="flex items-center gap-2.5">
              <Icon size={16} className="shrink-0 text-ink-subtle" />
              <dt className={`text-[13px] text-ink-subtle ${deva}`}>{k}</dt>
              <dd
                className={`ml-auto text-[15px] font-semibold ${devaValue || deva ? "deva" : ""}`}
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </motion.div>

      <motion.div
        {...stagger(3, reduce)}
        className={`flex items-center justify-center gap-2 rounded-full bg-chip-sage px-4 py-2.5 text-[14px] font-semibold text-chip-sageink ${deva}`}
      >
        <CheckCircle size={17} weight="fill" />
        {s.assistant.saved}
      </motion.div>
    </div>
  );
}

/** Today's reminders, two already ticked off. */
export function SceneToday() {
  const { s, deva, reduce } = useMock();

  const rows = [
    { label: s.today.walk, time: s.today.morning, done: true },
    { label: s.reminder.medicine, time: s.today.due, done: true },
    { label: s.today.call, time: s.today.evening, done: false },
  ];

  return (
    <div className={shell}>
      <motion.p
        {...stagger(0, reduce, 0.05)}
        className={`text-[17px] font-bold tracking-[-0.02em] ${deva}`}
      >
        {s.today.title}
      </motion.p>

      {rows.map((r, i) => (
        <motion.div key={r.label} {...stagger(i + 1, reduce)} className={row}>
          <motion.span
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.7 + i * 0.2, ease }}
            className={`grid size-7 shrink-0 place-items-center rounded-full ${
              r.done
                ? "bg-chip-sage text-chip-sageink"
                : "border border-line text-ink-subtle"
            }`}
          >
            {r.done && <CheckCircle size={19} weight="fill" />}
          </motion.span>
          <span className={`text-[15px] font-semibold ${deva}`}>{r.label}</span>
          <span className="ml-auto text-[13px] text-ink-subtle">{r.time}</span>
        </motion.div>
      ))}
    </div>
  );
}

/** Guardian setting a reminder on a parent's behalf, pending their confirmation. */
export function SceneGuardian() {
  const { s, deva, reduce } = useMock();

  return (
    <div className={shell}>
      <motion.div {...stagger(0, reduce, 0.05)}>
        <p className={`text-[17px] font-bold tracking-[-0.02em] ${deva}`}>
          {s.guardian.title}
        </p>
        <p className={`mt-1 text-[13px] text-ink-subtle ${deva}`}>
          {s.guardian.forWhom}
        </p>
      </motion.div>

      <motion.dl
        {...stagger(1, reduce)}
        className="space-y-2 rounded-[12px] border border-line p-3.5"
      >
        {[
          { icon: BellRinging, k: s.reminder.what, v: s.reminder.medicine },
          { icon: Clock, k: s.reminder.when, v: s.reminder.time },
          { icon: ArrowsClockwise, k: s.reminder.repeats, v: s.reminder.daily },
        ].map(({ icon: Icon, k, v }) => (
          <div key={k} className="flex items-center gap-2.5">
            <Icon size={16} className="shrink-0 text-ink-subtle" />
            <dt className={`text-[13px] text-ink-subtle ${deva}`}>{k}</dt>
            <dd className={`ml-auto text-[15px] font-semibold ${deva}`}>{v}</dd>
          </div>
        ))}
      </motion.dl>

      <motion.p
        {...stagger(2, reduce)}
        className={`mt-auto rounded-[12px] bg-chip-sky px-3.5 py-3 text-[13px] leading-snug text-chip-skyink ${deva}`}
      >
        {s.guardian.note}
      </motion.p>
    </div>
  );
}

/** A question waiting on a moderator, which is the whole point of the board. */
export function SceneAsk() {
  const { s, deva, reduce } = useMock();

  return (
    <div className={shell}>
      <motion.article
        {...stagger(0, reduce, 0.05)}
        className="rounded-[14px] border border-line p-4"
      >
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full bg-chip-butter px-2.5 py-1 text-[11.5px] font-semibold text-chip-butterink ${deva}`}
          >
            {s.ask.inReview}
          </span>
          <span className="text-[12px] text-ink-subtle">{s.ask.author}</span>
        </div>
        <p className={`mt-2.5 text-[16px] leading-snug font-semibold ${deva}`}>
          {s.ask.postTitle}
        </p>
        <p className={`mt-1.5 text-[13.5px] leading-snug text-ink-subtle ${deva}`}>
          {s.ask.postBody}
        </p>
      </motion.article>

      <motion.div
        {...stagger(1, reduce)}
        className="mt-auto rounded-[14px] border border-dashed border-line p-4"
      >
        <p className="font-mono text-[10.5px] tracking-[0.16em] text-ink-subtle uppercase">
          {s.ask.title}
        </p>
        <p className={`mt-2 text-[13.5px] leading-snug text-ink-muted ${deva}`}>
          {s.ask.reviewNote}
        </p>
      </motion.div>
    </div>
  );
}

/**
 * City operations. Every row is a request type rather than a citizen, because a
 * marketing page has no business showing a queue of real people, and the scope
 * banner is the actual product rule: one city per staff account.
 */
export function SceneAdmin() {
  const { s, deva, reduce } = useMock();

  return (
    <div className={shell}>
      <motion.div
        {...stagger(0, reduce, 0.05)}
        className="flex items-center justify-between gap-3"
      >
        <p className={`text-[17px] font-bold tracking-[-0.02em] ${deva}`}>
          {s.admin.title}
        </p>
        <span
          className={`shrink-0 rounded-full bg-chip-sky px-2.5 py-1 text-[11.5px] font-semibold text-chip-skyink ${deva}`}
        >
          {s.admin.scope}
        </span>
      </motion.div>

      <motion.p
        {...stagger(1, reduce)}
        className="font-mono text-[10.5px] tracking-[0.16em] text-ink-subtle uppercase"
      >
        {s.admin.queue}
      </motion.p>

      {s.admin.rows.map((label, i) => (
        <motion.div key={label} {...stagger(i + 2, reduce)} className={row}>
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold ${
              i === 0
                ? "bg-chip-sage text-chip-sageink"
                : "bg-paper-tint text-ink-subtle"
            }`}
          >
            {i + 1}
          </span>
          <span className={`text-[15px] font-semibold ${deva}`}>{label}</span>
          <span
            className={`ml-auto shrink-0 text-[12.5px] ${i === 0 ? "text-chip-sageink" : "text-ink-subtle"} ${deva}`}
          >
            {i === 0 ? s.admin.done : s.admin.pending}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
