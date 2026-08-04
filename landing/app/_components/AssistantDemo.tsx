"use client";

import {
  ArrowsClockwise,
  BellRinging,
  Clock,
  Microphone,
} from "@phosphor-icons/react/dist/ssr";
import { useLang } from "../_lib/lang";
import { Reveal } from "./Reveal";

// The spoken line stays Hindi in every locale: the claim is that the app
// understands how an Indian parent actually talks, and translating the example
// into the reader's language would quietly remove the evidence for it.
const SPOKEN = "मुझे रोज़ शाम 8 बजे बीपी की दवा याद दिलाना";

export function AssistantDemo() {
  const { t, deva } = useLang();
  const a = t.assistant;

  const fields = [
    { icon: BellRinging, label: a.card.what, value: a.card.whatValue, deva: true },
    { icon: Clock, label: a.card.when, value: a.card.whenValue, deva: false },
    {
      icon: ArrowsClockwise,
      label: a.card.repeats,
      value: a.card.repeatsValue,
      deva: false,
    },
  ];

  return (
    <section className="border-y border-line bg-ink text-paper">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:gap-20 lg:py-32">
        <Reveal>
          <p className={`text-[13px] font-medium tracking-[0.14em] text-white/55 uppercase ${deva}`}>
            {a.eyebrow}
          </p>
          <h2
            className={`mt-5 text-[32px] leading-[1.15] font-bold tracking-[-0.03em] sm:text-[42px] ${deva}`}
          >
            {a.heading}
          </h2>

          <div className="mt-10 rounded-[16px] border border-white/12 bg-white/[0.04] p-6 sm:p-7">
            <div className="flex items-center gap-2 text-[13px] font-medium text-white/55">
              <Microphone size={16} weight="fill" className="text-white/70" />
              <span className={deva}>{a.listening}</span>
            </div>
            <p
              lang="hi"
              className="deva mt-4 text-[26px] leading-[1.5] font-medium sm:text-[30px]"
            >
              {SPOKEN}
            </p>
            <p className={`mt-4 text-[15px] text-white/55 ${deva}`}>{a.gloss}</p>
          </div>

          <p className={`mt-6 max-w-[52ch] text-[16px] leading-relaxed text-white/65 ${deva}`}>
            {a.note}
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mx-auto w-full max-w-[420px] rounded-[16px] bg-white p-6 text-ink sm:p-7">
            <p
              className={`text-[13px] font-medium tracking-[0.12em] text-ink-subtle uppercase ${deva}`}
            >
              {a.card.title}
            </p>

            <ul className="mt-5 divide-y divide-line">
              {fields.map(({ icon: Icon, label, value, deva: devaValue }) => (
                <li key={label} className="flex items-center gap-4 py-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-paper-tint">
                    <Icon size={20} weight="regular" />
                  </span>
                  <span className={`text-[14px] font-medium text-ink-subtle ${deva}`}>
                    {label}
                  </span>
                  <span
                    className={`ml-auto text-[18px] font-semibold ${devaValue || deva ? "deva" : ""}`}
                  >
                    {value}
                  </span>
                </li>
              ))}
            </ul>

            <div
              className={`mt-6 grid h-14 place-items-center rounded-full bg-ink text-[16px] font-semibold text-paper ${deva}`}
            >
              {a.card.save}
            </div>
          </div>

          <p className={`mt-5 text-center text-[15px] text-white/55 ${deva}`}>
            {a.caption}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
