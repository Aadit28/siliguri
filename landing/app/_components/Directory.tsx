"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Broom,
  Bus,
  HandHeart,
  Hospital,
  MapPinPlus,
  Pill,
  Stethoscope,
  Wrench,
} from "@phosphor-icons/react/dist/ssr";
import { CITIES, type CityKey } from "../_lib/copy";
import { useLang } from "../_lib/lang";
import { Reveal } from "./Reveal";

const order = [
  { key: "elder_home", icon: HandHeart, tone: "sage" },
  { key: "doctor", icon: Stethoscope, tone: "sky" },
  { key: "hospital", icon: Hospital, tone: "peach" },
  { key: "medical_shop", icon: Pill, tone: "lilac" },
  { key: "travel_agent", icon: Bus, tone: "butter" },
  { key: "home_service", icon: Wrench, tone: "sage" },
  { key: "daily_service", icon: Broom, tone: "sky" },
] as const;

const tones = {
  sage: "bg-chip-sage text-chip-sageink",
  sky: "bg-chip-sky text-chip-skyink",
  peach: "bg-chip-peach text-chip-peachink",
  lilac: "bg-chip-lilac text-chip-lilacink",
  butter: "bg-chip-butter text-chip-butterink",
} as const;

export function Directory() {
  const { t, deva } = useLang();
  const [active, setActive] = useState<CityKey>("siliguri");
  const reduce = useReducedMotion();

  const city = CITIES.find((c) => c.key === active)!;
  const d = t.directory;

  return (
    <section
      id="directory"
      className="scroll-mt-[80px] border-t border-line bg-paper-alt py-24 lg:py-32"
    >
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <Reveal>
          <p
            className={`text-[13px] font-medium tracking-[0.14em] text-ink-subtle uppercase ${deva}`}
          >
            {d.eyebrow}
          </p>

          {/* City tabs, not a dropdown: three is few enough to show at once, and
              the counts change under them so the switch has visible consequence. */}
          <div className="mt-6 flex flex-wrap gap-2">
            {CITIES.map((c) => {
              const selected = c.key === active;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActive(c.key)}
                  className={`h-12 rounded-full border px-5 text-[16px] font-semibold transition-colors active:translate-y-px ${deva} ${
                    selected
                      ? "border-ink bg-ink text-paper"
                      : "border-line bg-paper text-ink-muted hover:border-ink/30 hover:text-ink"
                  }`}
                >
                  {t.cities[c.key]}
                  <span
                    className={`ml-2 text-[14px] font-medium ${selected ? "text-paper/60" : "text-ink-subtle"}`}
                  >
                    {t.states[c.key]}
                  </span>
                </button>
              );
            })}

            {/* Sits with the cities, not at the end of the rail: someone whose
                city is missing should not have to scroll sideways past seven
                categories to find out they can ask for it. */}
            <a
              href="#waitlist"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("saathi:request-city"))
              }
              className={`inline-flex h-12 items-center gap-2 rounded-full border border-dashed border-ink/35 px-5 text-[16px] font-semibold text-ink-muted transition-colors hover:border-ink hover:text-ink active:translate-y-px ${deva}`}
            >
              <MapPinPlus size={20} weight="regular" />
              {d.requestCta}
            </a>
          </div>

          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <h2
              className={`max-w-[18ch] text-[32px] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[42px] ${deva}`}
            >
              {d.heading(city.total)}
            </h2>
            <div className="max-w-[38ch]">
              <p className={`text-[16px] leading-relaxed text-ink-muted ${deva}`}>
                {d.body}
              </p>
              <p className={`mt-3 text-[15px] leading-relaxed text-ink-subtle ${deva}`}>
                {d.requestNote}
              </p>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.08}>
        <AnimatePresence mode="wait">
          <motion.ul
            key={active}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="no-scrollbar mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:px-8 lg:px-[max(2rem,calc((100vw-1240px)/2+2rem))]"
          >
            {order.map(({ key, icon: Icon, tone }) => (
              <li
                key={key}
                className="w-[228px] shrink-0 snap-start rounded-[16px] border border-line bg-paper p-6"
              >
                <span
                  className={`grid size-12 place-items-center rounded-[10px] ${tones[tone]}`}
                >
                  <Icon size={24} weight="regular" />
                </span>
                <p className="mt-14 text-[40px] leading-none font-bold tracking-[-0.04em] tabular-nums">
                  {city.counts[key]}
                </p>
                <p className={`mt-2 text-[16px] font-medium text-ink-muted ${deva}`}>
                  {d.categories[key]}
                </p>
              </li>
            ))}

          </motion.ul>
        </AnimatePresence>
      </Reveal>
    </section>
  );
}
