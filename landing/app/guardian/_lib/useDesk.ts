"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  errorMessage,
  fetchBookings,
  fetchLinkedParents,
  isAuthError,
  type Booking,
  type ParentLink,
} from "./api";

/**
 * The whole desk loads from two calls: the guardian's family links, then one
 * booking list per linked parent. It has to be per parent — bookings/mine
 * answers 400 rather than guessing when a guardian looks after more than one —
 * so the lists are fetched in parallel and merged here.
 *
 * The per-parent fetches are settled independently: one parent's list failing
 * must not blank the other parent's, and the card shows which one is missing.
 */

type Phase = "loading" | "ready" | "error";

export type ParentBookings = {
  parent: ParentLink;
  bookings: Booking[];
  error: string | null;
};

export type PendingApproval = {
  booking: Booking;
  parent: ParentLink;
};

export function useDesk(token: string | null, onAuthFailure: () => void) {
  const [links, setLinks] = useState<ParentLink[]>([]);
  const [linksPhase, setLinksPhase] = useState<Phase>("loading");
  const [linksError, setLinksError] = useState<string | null>(null);

  const [byParent, setByParent] = useState<ParentBookings[]>([]);
  const [bookingsPhase, setBookingsPhase] = useState<Phase>("loading");

  const [refreshing, setRefreshing] = useState(false);

  // Only the newest load may write state: a refresh started while the first is
  // still in flight would otherwise be overwritten by the slower answer.
  const generation = useRef(0);
  const authFailed = useRef(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!token) return;
      const run = generation.current + 1;
      generation.current = run;
      const current = () => generation.current === run;

      if (mode === "refresh") setRefreshing(true);
      else {
        setLinksPhase("loading");
        setBookingsPhase("loading");
      }

      let active: ParentLink[] = [];
      try {
        const all = await fetchLinkedParents(token);
        if (!current()) return;
        setLinks(all);
        setLinksPhase("ready");
        setLinksError(null);
        active = all.filter((link) => link.status === "active" && link.parentId);
      } catch (error) {
        if (!current()) return;
        if (isAuthError(error)) {
          if (!authFailed.current) {
            authFailed.current = true;
            onAuthFailure();
          }
          return;
        }
        setLinksPhase("error");
        setLinksError(errorMessage(error));
        setBookingsPhase("error");
        setRefreshing(false);
        return;
      }

      if (active.length === 0) {
        if (!current()) return;
        setByParent([]);
        setBookingsPhase("ready");
        setRefreshing(false);
        return;
      }

      const settled = await Promise.all(
        active.map(async (parent): Promise<ParentBookings> => {
          try {
            const bookings = await fetchBookings(token, parent.parentId as string);
            return { parent, bookings, error: null };
          } catch (error) {
            if (isAuthError(error)) throw error;
            return { parent, bookings: [], error: errorMessage(error) };
          }
        }),
      ).catch((error: unknown) => {
        if (isAuthError(error) && !authFailed.current) {
          authFailed.current = true;
          onAuthFailure();
        }
        return null;
      });

      if (!current() || settled === null) return;
      setByParent(settled);
      setBookingsPhase("ready");
      setRefreshing(false);
    },
    [onAuthFailure, token],
  );

  useEffect(() => {
    if (!token) return;
    void load("initial");
  }, [load, token]);

  const refresh = useCallback(() => {
    void load("refresh");
  }, [load]);

  /**
   * bookings/approve answers with the row it just wrote, so the card can show
   * the new status without waiting for a whole reload — and without inventing
   * a status of its own, which would be a lie the moment the API disagreed.
   */
  const applyBooking = useCallback((updated: Booking) => {
    setByParent((groups) =>
      groups.map((group) => ({
        ...group,
        bookings: group.bookings.map((booking) =>
          booking.id === updated.id ? { ...booking, ...updated } : booking,
        ),
      })),
    );
  }, []);

  const activeParents = useMemo(
    () => links.filter((link) => link.status === "active" && link.parentId),
    [links],
  );

  const pending = useMemo<PendingApproval[]>(
    () =>
      byParent
        .flatMap((group) =>
          group.bookings
            .filter((booking) => booking.status === "pending_guardian")
            .map((booking) => ({ booking, parent: group.parent })),
        )
        .sort((a, b) => sortByCreated(a.booking, b.booking)),
    [byParent],
  );

  const recent = useMemo<PendingApproval[]>(
    () =>
      byParent
        .flatMap((group) => group.bookings.map((booking) => ({ booking, parent: group.parent })))
        .sort((a, b) => sortByCreated(a.booking, b.booking)),
    [byParent],
  );

  const bookingErrors = useMemo(
    () => byParent.filter((group) => group.error !== null),
    [byParent],
  );

  return {
    links,
    activeParents,
    linksPhase,
    linksError,
    byParent,
    bookingsPhase,
    bookingErrors,
    pending,
    recent,
    refresh,
    refreshing,
    applyBooking,
  };
}

function sortByCreated(a: Booking, b: Booking): number {
  const left = a.createdAt ? Date.parse(a.createdAt) : 0;
  const right = b.createdAt ? Date.parse(b.createdAt) : 0;
  return right - left;
}
