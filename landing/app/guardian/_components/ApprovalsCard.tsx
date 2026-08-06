"use client";

import { useState } from "react";
import { Microphone } from "@phosphor-icons/react/dist/ssr";
import type { ParentBookings, PendingApproval } from "../_lib/useDesk";
import { formatAmount, formatDateTime, parentLabel } from "../_lib/format";
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineSpinner,
  LoadingRows,
  RefreshButton,
  buttonDanger,
  buttonPrimary,
  buttonQuiet,
} from "./ui";

type Phase = "loading" | "ready" | "error";

/**
 * The reason the desk exists. A booking over the family's spend threshold sits
 * here until a guardian says yes or no, and the API expires it after 24 hours —
 * so the amount and the age of the request are the two things a row must show.
 */
export function ApprovalsCard({
  items,
  phase,
  error,
  parentErrors,
  onAnswer,
  onRefresh,
  refreshing,
  hasParents,
}: {
  items: PendingApproval[];
  phase: Phase;
  error: string | null;
  parentErrors: ParentBookings[];
  onAnswer: (bookingId: string, approve: boolean) => Promise<string | null>;
  onRefresh: () => void;
  refreshing: boolean;
  hasParents: boolean;
}) {
  // A parent whose list did not load cannot be reported as having nothing
  // waiting: "no approvals pending" is the one answer this card must never
  // give when it does not actually know.
  const incomplete = parentErrors.length > 0;

  return (
    <Card>
      <CardHeader
        eyebrow="Waiting on you"
        title="Approvals"
        count={items.length}
        action={<RefreshButton onClick={onRefresh} busy={refreshing} />}
      />

      {phase === "loading" && <LoadingRows rows={2} />}
      {phase === "error" && error && <ErrorState message={error} onRetry={onRefresh} />}

      {phase === "ready" &&
        parentErrors.map((group) => (
          <ErrorState
            key={group.parent.id}
            message={`Could not check what is waiting for ${parentLabel(
              group.parent.parentName,
              group.parent.parentPhone,
            )}. ${group.error}`}
            onRetry={onRefresh}
          />
        ))}

      {phase === "ready" && items.length === 0 && !incomplete && (
        <EmptyState
          title={hasParents ? "Nothing needs your answer" : "No linked parent yet"}
          body={
            hasParents
              ? "Bookings above the family's spend threshold land here. You will also get a push on the app."
              : "Link a parent from the Saathi app on your phone, then their bookings appear here."
          }
        />
      )}

      {phase === "ready" && items.length > 0 && (
        <ul className="divide-y divide-line">
          {items.map(({ booking, parent }) => (
            <ApprovalRow
              key={booking.id}
              bookingId={booking.id}
              who={parentLabel(parent.parentName, parent.parentPhone)}
              amount={formatAmount(booking.amountPaise)}
              asked={formatDateTime(booking.createdAt)}
              byVoice={booking.createdBy === "voice_agent"}
              onAnswer={onAnswer}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ApprovalRow({
  bookingId,
  who,
  amount,
  asked,
  byVoice,
  onAnswer,
}: {
  bookingId: string;
  who: string;
  amount: string;
  asked: string;
  byVoice: boolean;
  onAnswer: (bookingId: string, approve: boolean) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  async function answer(approve: boolean) {
    setBusy(approve ? "approve" : "decline");
    setRowError(null);
    // The boolean is passed through untouched all the way to the API, which
    // rejects anything that is not a real true/false.
    const failure = await onAnswer(bookingId, approve);
    setBusy(null);
    setConfirming(false);
    if (failure) setRowError(failure);
  }

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-[180px] flex-1">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {who}
            {byVoice && (
              <span
                title="Booked by voice"
                className="inline-flex items-center gap-1 rounded-full bg-chip-lilac px-2 py-0.5 text-[11px] font-semibold text-chip-lilacink"
              >
                <Microphone size={11} weight="fill" />
                Voice
              </span>
            )}
          </p>
          <p className="mt-1 text-[13px] text-ink-subtle">Asked {asked}</p>
        </div>

        <div className="min-w-[92px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">Amount</p>
          <p className="mt-0.5 text-[16px] font-bold tabular-nums">{amount}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {confirming ? (
            <>
              <span className="text-[13px] font-medium text-ink-muted">Decline it?</span>
              <button
                type="button"
                className={buttonDanger}
                onClick={() => answer(false)}
                disabled={busy !== null}
              >
                {busy === "decline" && <InlineSpinner />}
                Yes, decline
              </button>
              <button
                type="button"
                className={buttonQuiet}
                onClick={() => setConfirming(false)}
                disabled={busy !== null}
              >
                Keep
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={buttonPrimary}
                onClick={() => answer(true)}
                disabled={busy !== null}
              >
                {busy === "approve" && <InlineSpinner />}
                Approve
              </button>
              {/* Declining cancels the booking and hands the slot back — one
                  step away from irreversible, so it asks first. */}
              <button
                type="button"
                className={buttonQuiet}
                onClick={() => setConfirming(true)}
                disabled={busy !== null}
              >
                Decline
              </button>
            </>
          )}
        </div>
      </div>

      {rowError && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-emergency">
          {rowError}
        </p>
      )}
    </li>
  );
}
