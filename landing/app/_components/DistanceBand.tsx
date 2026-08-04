"use client";

import { useEffect, useState } from "react";
import { useLang } from "../_lib/lang";
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

function Clock({
  label,
  time,
  deva,
}: {
  label: string;
  time: string;
  deva: string;
}) {
  return (
    <div className="flex-1 border-t-2 border-ink pt-4">
      <p
        className={`text-[13px] font-medium tracking-[0.12em] text-ink-subtle uppercase ${deva}`}
      >
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
  const { t, deva } = useLang();
  const d = t.distance;
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
          <h2
            className={`max-w-[20ch] text-[32px] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[42px] ${deva}`}
          >
            {d.heading}
          </h2>
          <p className={`mt-4 max-w-[56ch] text-[17px] leading-relaxed text-ink-muted ${deva}`}>
            {d.body}
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-12 flex flex-col gap-8 sm:flex-row sm:gap-14">
            <Clock label={d.clockIndia} time={format(now, "Asia/Kolkata")} deva={deva} />
            <Clock
              label={isIndia ? d.clockDevice : `${d.clockYou} · ${localZone}`}
              time={format(now)}
              deva={deva}
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
