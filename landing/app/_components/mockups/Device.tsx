"use client";

import type { ReactNode } from "react";
import {
  ChatCircle,
  House,
  MagnifyingGlass,
  Question,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { appStrings, mockIsDeva } from "../../_lib/appStrings";
import { useLang } from "../../_lib/lang";

export type TabKey = "home" | "services" | "assistant" | "ask" | "sos";

const TABS: { key: TabKey; icon: typeof House }[] = [
  { key: "home", icon: House },
  { key: "services", icon: MagnifyingGlass },
  { key: "assistant", icon: ChatCircle },
  { key: "ask", icon: UsersThree },
  { key: "sos", icon: Question },
];

/**
 * The phone shell every mock-up sits in: the product's real header and tab bar,
 * rebuilt in markup rather than pasted in as a screenshot. Coded means it can
 * animate, it stays sharp at any size, it picks up the visitor's language, and
 * it never goes stale against a PNG captured months ago.
 */
export function Device({
  tab,
  children,
  className = "",
  /**
   * Drop the sign-in pill. The shell renders as narrow as ~175px inside the
   * hero grid, where brand + SOS + sign-in cannot all fit and the last one gets
   * clipped by the card's overflow.
   */
  showSignIn = true,
  rounded = "rounded-[22px]",
}: {
  tab: TabKey;
  children: ReactNode;
  className?: string;
  showSignIn?: boolean;
  rounded?: string;
}) {
  const { lang } = useLang();
  const s = appStrings(lang);
  const deva = mockIsDeva(lang) ? "deva" : "";

  return (
    <div
      className={`flex flex-col overflow-hidden border border-line bg-paper ${rounded} ${className}`}
    >
      {/* Everything here is shrink-0 and nowrap: the shell renders as narrow as
          240px, where a wrapping "SOS 112" would read as a broken button. */}
      <header className="flex shrink-0 items-center gap-1.5 border-b border-line px-2.5 py-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-[6px] bg-ink text-[10px] font-bold text-paper">
          S
        </span>
        <span className={`min-w-0 truncate text-[12px] font-semibold ${deva}`}>
          {s.brand}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-emergency px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap text-paper">
          SOS 112
        </span>
        {showSignIn && (
          <span
            className={`shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap ${deva}`}
          >
            {s.signIn}
          </span>
        )}
      </header>

      <div className="relative grow overflow-hidden">{children}</div>

      <nav className="flex shrink-0 items-stretch border-t border-line">
        {TABS.map(({ key, icon: Icon }) => {
          const active = key === tab;
          return (
            <span
              key={key}
              aria-hidden
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 transition-colors ${
                active ? "text-ink" : "text-ink-subtle"
              }`}
            >
              <Icon size={14} weight={active ? "fill" : "regular"} />
              <span
                className={`w-full truncate text-center text-[8px] leading-none font-medium ${deva}`}
              >
                {s.tabs[key]}
              </span>
            </span>
          );
        })}
      </nav>
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
