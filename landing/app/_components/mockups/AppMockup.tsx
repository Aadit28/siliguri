"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLang } from "../../_lib/lang";
import { Panel, type TabKey } from "./Device";
import { SceneAdmin, SceneGuardian, SceneServices } from "./scenes";

/**
 * One panel, three roles. The product's whole shape is that a single app shows
 * three different things depending on who signed in, so the mock-up lets the
 * reader do the switching rather than describing it in prose.
 */
const ROLES: {
  key: "parent" | "guardian" | "admin";
  tab: TabKey;
  dot: string;
  Scene: () => React.JSX.Element;
}[] = [
  { key: "parent", tab: "services", dot: "bg-chip-sageink", Scene: SceneServices },
  { key: "guardian", tab: "home", dot: "bg-chip-skyink", Scene: SceneGuardian },
  { key: "admin", tab: "ask", dot: "bg-chip-lilacink", Scene: SceneAdmin },
];

const HOLD_MS = 5200;

export function AppMockup({
  className = "",
  rounded = "rounded-[20px]",
}: {
  className?: string;
  rounded?: string;
}) {
  const { t, deva } = useLang();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  // Cycles on its own until the reader takes the toggle, then stays put — a
  // control that keeps moving after you have grabbed it is fighting its reader.
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (reduce || !auto) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % ROLES.length), HOLD_MS);
    return () => clearInterval(id);
  }, [reduce, auto]);

  const { tab, Scene, key: activeKey } = ROLES[index];
  const meta = {
    parent: t.portals.parent,
    guardian: t.portals.guardian,
    admin: t.portals.admin,
  };

  return (
    <div className={`flex min-h-0 flex-col gap-3 lg:flex-row lg:gap-4 ${className}`}>
      {/* Rail on the left, panel on the right: the control sits beside the
          thing it changes rather than on top of it, so the eye tracks the swap
          horizontally instead of losing the panel's top edge on every switch. */}
      <div
        role="tablist"
        aria-label={t.portals.heading}
        aria-orientation="vertical"
        className="flex shrink-0 flex-row gap-2 lg:w-[132px] lg:flex-col xl:w-[164px]"
      >
        {ROLES.map((r, i) => {
          const active = i === index;
          return (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setIndex(i);
                setAuto(false);
              }}
              className={`group relative flex min-w-0 flex-1 items-center gap-2.5 rounded-full border px-3 py-2.5 text-left transition-colors sm:flex-none ${
                active
                  ? "border-line bg-paper shadow-[0_6px_18px_rgba(10,10,10,0.08)]"
                  : "border-transparent bg-paper/55 hover:bg-paper/85"
              }`}
            >
              {/* The selected pill's white ground slides between the three
                  rather than three grounds cross-fading — one object moving is
                  easier to follow than two changing opacity. */}
              <span
                aria-hidden
                className={`size-2.5 shrink-0 rounded-full transition-opacity ${r.dot} ${
                  active ? "opacity-100" : "opacity-45"
                }`}
              />
              <span
                className={`truncate text-[13.5px] font-semibold ${deva} ${
                  active ? "text-ink" : "text-ink-subtle group-hover:text-ink"
                }`}
              >
                {meta[r.key].title}
              </span>
            </button>
          );
        })}

        {/* Role line, swapped with the panel: the rail carries the who, the
            panel carries the what. Hidden on mobile where the rail is a row. */}
        <div className="mt-1 hidden min-h-[3.2em] lg:block">
          <AnimatePresence mode="wait">
            <motion.p
              key={activeKey}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.28 }}
              className={`px-3 text-[12.5px] leading-snug text-ink-subtle ${deva}`}
            >
              {meta[activeKey].role}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      <Panel label={tab} rounded={rounded} className="min-h-0 min-w-0 grow">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            className="absolute inset-0"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Scene />
          </motion.div>
        </AnimatePresence>
      </Panel>
    </div>
  );
}
