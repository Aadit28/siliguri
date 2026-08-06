"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  answerBooking,
  errorMessage,
  isAuthError,
  type ParentLink,
} from "./_lib/api";
import { useSession } from "./_lib/session";
import { useDesk } from "./_lib/useDesk";
import { Shell } from "./_components/Shell";
import { ApprovalsCard } from "./_components/ApprovalsCard";
import { BookingsCard } from "./_components/BookingsCard";
import { ParentsCard } from "./_components/ParentsCard";

/**
 * The desk itself. Everything is client-side on purpose: the token lives in
 * sessionStorage, so no server render can know who is asking, and an SSR pass
 * would only produce a signed-out shell for a signed-in guardian.
 */
export default function GuardianPage() {
  const router = useRouter();
  const { status, session, endSession, signOut } = useSession();
  const token = session?.token ?? null;

  const [signingOut, setSigningOut] = useState(false);
  const [filter, setFilter] = useState<ParentLink | null>(null);

  // One place turns a dead token into a trip back to the sign-in form, so no
  // card has to decide what a 401 means.
  const onAuthFailure = useCallback(() => endSession("expired"), [endSession]);

  const desk = useDesk(token, onAuthFailure);
  const { applyBooking, refresh } = desk;

  useEffect(() => {
    if (status === "anon") router.replace("/guardian/login");
  }, [router, status]);

  const onAnswer = useCallback(
    async (bookingId: string, approve: boolean): Promise<string | null> => {
      if (!token) {
        onAuthFailure();
        return null;
      }
      try {
        applyBooking(await answerBooking(token, bookingId, approve));
        return null;
      } catch (error) {
        if (isAuthError(error)) {
          onAuthFailure();
          return null;
        }
        // 409 means another guardian answered first, or the sweep expired it —
        // the row on screen is stale, so pull the real state rather than leave
        // a button that will keep failing.
        if (error instanceof ApiError && error.kind === "conflict") refresh();
        return errorMessage(error);
      }
    },
    [applyBooking, onAuthFailure, refresh, token],
  );

  const bookingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of desk.byParent) {
      if (group.parent.parentId) counts[group.parent.parentId] = group.bookings.length;
    }
    return counts;
  }, [desk.byParent]);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
  }

  // The gap between mount and reading sessionStorage. Blank rather than a
  // flash of the signed-out state.
  if (status !== "authed" || !session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper-alt">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
          Opening the desk…
        </p>
      </div>
    );
  }

  const firstName = session.user.fullName.split(" ")[0] || "there";
  const waiting = desk.pending.length;

  return (
    <Shell user={session.user} onSignOut={handleSignOut} signingOut={signingOut}>
      <div className="mb-7">
        <h1 className="text-[28px] leading-[1.15] font-bold tracking-[-0.03em] sm:text-[32px]">
          {`Hello, ${firstName}`}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
          {desk.bookingsPhase === "loading"
            ? "Checking what needs you…"
            : waiting > 0
              ? `${waiting} booking${waiting === 1 ? "" : "s"} waiting on your answer. Times are Siliguri time.`
              : "Nothing is waiting on your answer. Times are Siliguri time."}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7 xl:col-span-8">
          <ApprovalsCard
            items={desk.pending}
            phase={desk.bookingsPhase}
            error={desk.linksError}
            parentErrors={desk.bookingErrors}
            onAnswer={onAnswer}
            onRefresh={refresh}
            refreshing={desk.refreshing}
            hasParents={desk.activeParents.length > 0}
          />
        </div>

        <div className="lg:col-span-5 xl:col-span-4">
          <ParentsCard
            links={desk.links}
            phase={desk.linksPhase}
            error={desk.linksError}
            onRetry={refresh}
            bookingCounts={bookingCounts}
            activeFilterId={filter?.parentId ?? null}
            onFilter={(link) =>
              setFilter((current) => (current?.parentId === link.parentId ? null : link))
            }
          />
        </div>

        <div className="lg:col-span-12">
          <BookingsCard
            rows={desk.recent}
            phase={desk.bookingsPhase}
            error={desk.linksError}
            filterParent={filter}
            onClearFilter={() => setFilter(null)}
            parentErrors={desk.bookingErrors}
          />
        </div>
      </div>
    </Shell>
  );
}
