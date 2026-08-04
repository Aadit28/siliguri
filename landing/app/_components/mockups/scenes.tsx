"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  ArrowsClockwise,
  BellRinging,
  CheckCircle,
  Clock,
  Broom,
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

/** Directory search: the query lands, then verified results paint in. */
export function SceneServices() {
  const { s, deva, reduce } = useMock();

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <motion.div
        {...stagger(0, reduce, 0.05)}
        className="flex items-center gap-2 rounded-[10px] border border-line bg-paper-alt px-2.5 py-2"
      >
        <MagnifyingGlass size={14} className="shrink-0 text-ink-subtle" />
        <span className={`truncate text-[11px] text-ink-subtle ${deva}`}>
          {s.services.search}
        </span>
      </motion.div>

      <ul className="flex flex-col gap-2">
        {SAMPLE_LISTINGS.map((item, i) => {
          const Icon = listingIcon[item.icon];
          return (
          <motion.li
            key={item.name}
            {...stagger(i + 1, reduce)}
            className="flex items-center gap-2.5 rounded-[10px] border border-line p-1.5"
          >
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-[7px] ${chipTone[item.tone]}`}
            >
              <Icon size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold">
                {item.name}
              </span>
              <span className="mt-0.5 flex items-center gap-1 truncate text-[9.5px] whitespace-nowrap text-ink-subtle">
                <SealCheck size={10} weight="fill" className="shrink-0 text-chip-sageink" />
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

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <motion.div
        {...stagger(0, reduce, 0.05)}
        className="flex items-center justify-between"
      >
        <span className={`text-[10px] text-ink-subtle ${deva}`}>
          {s.assistant.online}
        </span>
        <span
          className={`rounded-full border border-line px-2 py-1 text-[10px] font-semibold ${deva}`}
        >
          {s.assistant.newChat}
        </span>
      </motion.div>

      {/* Always Hindi: this is the sentence the parent actually says. */}
      <motion.p
        {...stagger(1, reduce)}
        lang="hi"
        className="deva ml-auto max-w-[85%] rounded-[12px] rounded-br-[4px] bg-ink px-2.5 py-2 text-[11.5px] leading-snug text-paper"
      >
        मुझे रोज़ शाम 8 बजे बीपी की दवा याद दिलाना
      </motion.p>

      <motion.div
        {...stagger(2, reduce)}
        className="rounded-[12px] rounded-bl-[4px] border border-line p-2.5"
      >
        <p
          className={`text-[9.5px] font-semibold tracking-[0.1em] text-ink-subtle uppercase ${deva}`}
        >
          {s.reminder.title}
        </p>
        <dl className="mt-2 space-y-1.5">
          {[
            { icon: BellRinging, k: s.reminder.what, v: s.reminder.medicine },
            { icon: Clock, k: s.reminder.when, v: s.reminder.time },
            { icon: ArrowsClockwise, k: s.reminder.repeats, v: s.reminder.daily },
          ].map(({ icon: Icon, k, v }) => (
            <div key={k} className="flex items-center gap-2">
              <Icon size={13} className="shrink-0 text-ink-subtle" />
              <dt className={`text-[10.5px] text-ink-subtle ${deva}`}>{k}</dt>
              <dd className={`ml-auto text-[11.5px] font-semibold ${deva}`}>{v}</dd>
            </div>
          ))}
        </dl>
      </motion.div>

      <motion.div
        {...stagger(3, reduce)}
        className={`flex items-center justify-center gap-1.5 rounded-full bg-chip-sage px-3 py-2 text-[11px] font-semibold text-chip-sageink ${deva}`}
      >
        <CheckCircle size={14} weight="fill" />
        {s.assistant.saved}
      </motion.div>
    </div>
  );
}

/** Today's reminders, with the first one being ticked off. */
export function SceneToday() {
  const { s, deva, reduce } = useMock();

  const rows = [
    { label: s.today.walk, time: s.today.morning, done: true },
    { label: s.reminder.medicine, time: s.today.due, done: true },
    { label: s.today.call, time: s.today.evening, done: false },
  ];

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <motion.p
        {...stagger(0, reduce, 0.05)}
        className={`text-[13px] font-bold tracking-[-0.02em] ${deva}`}
      >
        {s.today.title}
      </motion.p>

      {rows.map((row, i) => (
        <motion.div
          key={row.label}
          {...stagger(i + 1, reduce)}
          className="flex items-center gap-2.5 rounded-[10px] border border-line p-2.5"
        >
          <motion.span
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.7 + i * 0.25, ease }}
            className={`grid size-6 shrink-0 place-items-center rounded-full ${
              row.done
                ? "bg-chip-sage text-chip-sageink"
                : "border border-line text-ink-subtle"
            }`}
          >
            {row.done && <CheckCircle size={16} weight="fill" />}
          </motion.span>
          <span className={`text-[11.5px] font-semibold ${deva}`}>{row.label}</span>
          <span className="ml-auto text-[10.5px] text-ink-subtle">{row.time}</span>
        </motion.div>
      ))}
    </div>
  );
}

/** Guardian setting a reminder on a parent's behalf, pending their confirmation. */
export function SceneGuardian() {
  const { s, deva, reduce } = useMock();

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <motion.div {...stagger(0, reduce, 0.05)}>
        <p className={`text-[13px] font-bold tracking-[-0.02em] ${deva}`}>
          {s.guardian.title}
        </p>
        <p className={`mt-0.5 text-[10.5px] text-ink-subtle ${deva}`}>
          {s.guardian.forWhom}
        </p>
      </motion.div>

      <motion.dl
        {...stagger(1, reduce)}
        className="space-y-1.5 rounded-[10px] border border-line p-2.5"
      >
        {[
          { icon: BellRinging, k: s.reminder.what, v: s.reminder.medicine },
          { icon: Clock, k: s.reminder.when, v: s.reminder.time },
          { icon: ArrowsClockwise, k: s.reminder.repeats, v: s.reminder.daily },
        ].map(({ icon: Icon, k, v }) => (
          <div key={k} className="flex items-center gap-2">
            <Icon size={13} className="shrink-0 text-ink-subtle" />
            <dt className={`text-[10.5px] text-ink-subtle ${deva}`}>{k}</dt>
            <dd className={`ml-auto text-[11.5px] font-semibold ${deva}`}>{v}</dd>
          </div>
        ))}
      </motion.dl>

      <motion.p
        {...stagger(2, reduce)}
        className={`rounded-[10px] bg-chip-sky px-2.5 py-2 text-[10.5px] leading-snug text-chip-skyink ${deva}`}
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
    <div className="flex h-full flex-col gap-2 p-2.5">
      <motion.p
        {...stagger(0, reduce, 0.05)}
        className={`text-[13px] font-bold tracking-[-0.02em] ${deva}`}
      >
        {s.ask.title}
      </motion.p>

      <motion.article
        {...stagger(1, reduce)}
        className="rounded-[10px] border border-line p-2.5"
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded-full bg-chip-butter px-2 py-0.5 text-[9.5px] font-semibold text-chip-butterink ${deva}`}
          >
            {s.ask.inReview}
          </span>
          <span className="text-[9.5px] text-ink-subtle">{s.ask.author}</span>
        </div>
        <p className={`mt-1.5 text-[11.5px] leading-snug font-semibold ${deva}`}>
          {s.ask.postTitle}
        </p>
        <p className={`mt-1 text-[10.5px] leading-snug text-ink-subtle ${deva}`}>
          {s.ask.postBody}
        </p>
      </motion.article>

      <motion.p
        {...stagger(2, reduce)}
        className={`mt-auto text-[10px] leading-snug text-ink-subtle ${deva}`}
      >
        {s.ask.reviewNote}
      </motion.p>
    </div>
  );
}
