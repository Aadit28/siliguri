"use client";

import type { ReactNode } from "react";
import { ArrowClockwise, SpinnerGap, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { BookingStatus } from "../_lib/api";
import { statusLabel, statusTone } from "../_lib/format";

/**
 * The desk's shared surface vocabulary. Same tokens as the marketing page —
 * 16px cards, hairline `line` borders, ink/paper — at desk density rather than
 * landing-page density: tighter padding, smaller type, no reveal animations.
 */

export const cardClass = "rounded-[16px] border border-line bg-paper";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`${cardClass} flex flex-col ${className}`}>{children}</section>;
}

export function CardHeader({
  eyebrow,
  title,
  count,
  action,
}: {
  eyebrow: string;
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
          {eyebrow}
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-[18px] font-bold tracking-[-0.02em]">
          {title}
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-ink px-2 py-0.5 text-[12px] font-semibold text-paper tabular-nums">
              {count}
            </span>
          )}
        </h2>
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </header>
  );
}

const TONES: Record<string, string> = {
  wait: "bg-chip-peach text-chip-peachink",
  live: "bg-chip-sky text-chip-skyink",
  good: "bg-chip-sage text-chip-sageink",
  done: "bg-paper-tint text-ink-muted",
  dead: "bg-paper-tint text-ink-subtle line-through decoration-ink-subtle/40",
};

export function StatusPill({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${
        TONES[statusTone(status)]
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

/** Primary action: the pill button from the landing page, at desk height. */
export const buttonPrimary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-5 text-[14px] font-semibold text-paper transition-colors hover:bg-black active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

export const buttonQuiet =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line px-5 text-[14px] font-semibold text-ink-muted transition-colors hover:border-ink hover:text-ink active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

export const buttonDanger =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line px-5 text-[14px] font-semibold text-ink-muted transition-colors hover:border-emergency hover:bg-emergency-soft hover:text-emergency active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

export const fieldClass =
  "h-12 w-full rounded-[10px] border border-line bg-paper px-4 text-[15px] text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none disabled:opacity-60";

export function RefreshButton({
  onClick,
  busy,
  label = "Refresh",
}: {
  onClick: () => void;
  busy?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
    >
      <ArrowClockwise size={15} weight="bold" className={busy ? "animate-spin" : undefined} />
      {label}
    </button>
  );
}

/**
 * Every card owes the guardian one of four answers: still loading, nothing to
 * show, it broke, or the data. The first three come from here so they cannot
 * drift apart card to card, and so no card can quietly render nothing at all.
 */
export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-[12px] bg-paper-tint"
          style={{ animationDelay: `${index * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-[42ch] text-[14px] leading-relaxed text-ink-muted">{body}</p>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="m-5 rounded-[12px] border border-emergency/25 bg-emergency-soft p-4">
      <div className="flex gap-3">
        <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-emergency" />
        <div className="min-w-0">
          <p className="text-[14px] leading-relaxed font-medium text-ink">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex h-9 items-center rounded-full border border-emergency/30 bg-paper px-4 text-[13px] font-semibold text-emergency transition-colors hover:bg-emergency hover:text-paper"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function InlineSpinner() {
  return <SpinnerGap size={16} weight="bold" className="animate-spin" />;
}
