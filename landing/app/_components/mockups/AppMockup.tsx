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
  Scene: () => React.JSX.Element;
}[] = [
  { key: "parent", tab: "services", Scene: SceneServices },
  { key: "guardian", tab: "home", Scene: SceneGuardian },
  { key: "admin", tab: "ask", Scene: SceneAdmin },
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

  const { tab, Scene } = ROLES[index];
  const labels = {
    parent: t.portals.parent.title,
    guardian: t.portals.guardian.title,
    admin: t.portals.admin.title,
  };

  return (
    <div className={`flex flex-col ${className}`}>
      <div
        role="tablist"
        aria-label={t.portals.heading}
        className="mb-3 flex shrink-0 items-center gap-1 rounded-full border border-line bg-paper/80 p-1 backdrop-blur-sm"
      >
        {ROLES.map((r, i) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => {
              setIndex(i);
              setAuto(false);
            }}
            className={`h-9 flex-1 truncate rounded-full px-2 text-[13.5px] font-semibold transition-colors ${deva} ${
              i === index ? "bg-ink text-paper" : "text-ink-subtle hover:text-ink"
            }`}
          >
            {labels[r.key]}
          </button>
        ))}
      </div>

      <Panel label={tab} rounded={rounded} className="min-h-0 grow">
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
