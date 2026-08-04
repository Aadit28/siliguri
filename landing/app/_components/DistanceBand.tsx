"use client";

import { useEffect, useState } from "react";
import { Reveal } from "./Reveal";

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function format(date: Date | null, timeZone?: string) {
  if (!date) return "--:--";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}

function Clock({ label, time }: { label: string; time: string }) {
  return (
    <div className="flex-1 border-t-2 border-ink pt-4">
      <p className="text-[13px] font-medium tracking-[0.12em] text-ink-subtle uppercase">
        {label}
      </p>
      <p className="mt-1 text-[44px] leading-none font-bold tracking-[-0.04em] tabular-nums sm:text-[56px]">
        {time}
      </p>
    </div>
  );
}

/**
 * The clocks are live because the claim underneath them is about time zones.
 * A static pair of numbers would be decoration; a running pair is the argument.
 */
export function DistanceBand() {
  const now = useClock();
  const localZone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";
  const isIndia = localZone === "Asia/Kolkata";

  return (
    <section className="grid-lines border-y border-line bg-paper-alt">
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-24">
        <Reveal>
          <h2 className="max-w-[18ch] text-[32px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[42px]">
            Most families are split across time zones.
          </h2>
          <p className="mt-4 max-w-[54ch] text-[17px] leading-relaxed text-ink-muted">
            Reminders ring on Siliguri time. Guardians read every timestamp in
            IST, wherever they happen to be sitting, so nobody has to do the
            arithmetic at 2am.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-12 flex flex-col gap-8 sm:flex-row sm:gap-14">
            <Clock label="Siliguri · IST" time={format(now, "Asia/Kolkata")} />
            <Clock
              label={isIndia ? "Your device" : `Your time · ${localZone}`}
              time={format(now)}
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
