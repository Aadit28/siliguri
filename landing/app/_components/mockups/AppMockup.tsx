"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLang } from "../../_lib/lang";
import { Device, type TabKey } from "./Device";
import { SceneAssistant, SceneServices, SceneToday } from "./scenes";

const SCENES: { tab: TabKey; Scene: () => React.JSX.Element; label: 0 | 1 | 2 }[] = [
  { tab: "services", Scene: SceneServices, label: 0 },
  { tab: "assistant", Scene: SceneAssistant, label: 1 },
  { tab: "home", Scene: SceneToday, label: 2 },
];

const HOLD_MS = 4200;

/**
 * The hero's phone, playing three real tasks in a loop: find a verified
 * service, ask for a reminder in Hindi, see it waiting on the day. Each scene
 * moves the tab bar underneath it, so the loop reads as one person using the
 * app rather than three unrelated pictures.
 *
 * The dots are real controls, and taking one stops the loop — a carousel that
 * keeps moving after you have grabbed it is a carousel fighting its reader.
 */
export function AppMockup({ className = "" }: { className?: string }) {
  const { t } = useLang();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (reduce || !auto) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % SCENES.length), HOLD_MS);
    return () => clearInterval(id);
  }, [reduce, auto]);

  const { tab, Scene } = SCENES[index];
  const labels = t.hero.screens;

  return (
    <div className={`flex flex-col ${className}`}>
      <Device tab={tab} className="grow">
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
      </Device>

      <div className="mt-3 flex shrink-0 justify-center gap-1.5">
        {SCENES.map((scene, i) => (
          <button
            key={scene.tab}
            type="button"
            aria-label={labels[i].label}
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
    </div>
  );
}
