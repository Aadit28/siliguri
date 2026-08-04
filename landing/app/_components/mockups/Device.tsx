"use client";

import type { ReactNode } from "react";
import { appStrings, mockIsDeva } from "../../_lib/appStrings";
import { useLang } from "../../_lib/lang";

export type TabKey = "home" | "services" | "assistant" | "ask" | "sos";

/**
 * A wide surface, not a handset. Phone chrome — bezel, notch, five-item tab bar
 * — spent most of a card's area on furniture and squeezed the content into a
 * column too narrow to read at a glance. This keeps the product's header strip
 * for identity and gives everything else to the screen.
 */
export function Panel({
  label,
  children,
  className = "",
  rounded = "rounded-[20px]",
}: {
  label: TabKey;
  children: ReactNode;
  className?: string;
  rounded?: string;
}) {
  const { lang } = useLang();
  const s = appStrings(lang);
  const deva = mockIsDeva(lang) ? "deva" : "";

  return (
    <div
      className={`flex flex-col overflow-hidden border border-line bg-paper ${rounded} ${className}`}
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-line px-4 py-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-ink text-[12px] font-bold text-paper">
          S
        </span>
        <span className={`shrink-0 text-[14px] font-semibold ${deva}`}>
          {s.brand}
        </span>
        <span aria-hidden className="h-3.5 w-px shrink-0 bg-line" />
        <span
          className={`min-w-0 truncate font-mono text-[11px] tracking-[0.16em] text-ink-subtle uppercase ${deva}`}
        >
          {s.tabs[label]}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-emergency px-2 py-1 text-[10px] font-bold whitespace-nowrap text-paper">
          SOS 112
        </span>
      </header>

      <div className="relative grow overflow-hidden">{children}</div>
    </div>
  );
}

export const chipTone = {
  sage: "bg-chip-sage text-chip-sageink",
  sky: "bg-chip-sky text-chip-skyink",
  peach: "bg-chip-peach text-chip-peachink",
  lilac: "bg-chip-lilac text-chip-lilacink",
  butter: "bg-chip-butter text-chip-butterink",
} as const;
