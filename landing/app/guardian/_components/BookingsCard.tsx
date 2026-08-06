"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import type { ParentLink } from "../_lib/api";
import type { ParentBookings, PendingApproval } from "../_lib/useDesk";
import { formatAmount, formatDateTime, parentLabel } from "../_lib/format";
import { Card, CardHeader, EmptyState, ErrorState, LoadingRows, StatusPill } from "./ui";

type Phase = "loading" | "ready" | "error";

/**
 * Everything that has been arranged for the family, newest first. The API caps
 * each parent's list at 50 rows, which is what "recent" means here.
 *
 * There is no vendor name: bookings.vendor_id has no PostgREST-joinable foreign
 * key, so /bookings/mine returns the id alone. Rather than show a uuid, the row
 * carries what a guardian can actually act on — who it is for, what it costs,
 * where it has got to.
 */
export function BookingsCard({
  rows,
  phase,
  error,
  filterParent,
  onClearFilter,
  parentErrors,
}: {
  rows: PendingApproval[];
  phase: Phase;
  error: string | null;
  filterParent: ParentLink | null;
  onClearFilter: () => void;
  parentErrors: ParentBookings[];
}) {
  const visible = filterParent
    ? rows.filter((row) => row.parent.parentId === filterParent.parentId)
    : rows;

  return (
    <Card>
      <CardHeader
        eyebrow="Family activity"
        title="Recent bookings"
        action={
          filterParent ? (
            <button
              type="button"
              onClick={onClearFilter}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-soft px-3.5 text-[13px] font-semibold text-brand transition-colors hover:bg-brand hover:text-paper"
            >
              {parentLabel(filterParent.parentName, filterParent.parentPhone)}
              <X size={13} weight="bold" />
            </button>
          ) : undefined
        }
      />

      {phase === "loading" && <LoadingRows rows={4} />}
      {phase === "error" && error && <ErrorState message={error} />}

      {/* A parent whose list failed while the others loaded: say whose, rather
          than letting the merged list quietly under-report. */}
      {phase === "ready" &&
        parentErrors.map((group) => (
          <ErrorState
            key={group.parent.id}
            message={`Could not load bookings for ${parentLabel(
              group.parent.parentName,
              group.parent.parentPhone,
            )}. ${group.error}`}
          />
        ))}

      {phase === "ready" && visible.length === 0 && (
        <EmptyState
          title={filterParent ? "Nothing for this parent yet" : "No bookings yet"}
          body="Appointments booked from the app or by voice show up here, with whatever stage they have reached."
        />
      )}

      {phase === "ready" && visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                <th scope="col" className="px-5 py-3 font-medium">For</th>
                <th scope="col" className="px-5 py-3 font-medium">Booked</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Amount</th>
                <th scope="col" className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line border-t border-line">
              {visible.map(({ booking, parent }) => (
                <tr key={booking.id} className="align-middle transition-colors hover:bg-paper-alt">
                  <td className="px-5 py-3.5 text-[15px] font-medium">
                    {parentLabel(parent.parentName, parent.parentPhone)}
                    {booking.createdBy === "voice_agent" && (
                      <span className="ml-2 text-[12px] font-normal text-ink-subtle">by voice</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-[14px] whitespace-nowrap text-ink-muted">
                    {formatDateTime(booking.createdAt)}
                  </td>
                  <td className="px-5 py-3.5 text-right text-[14px] tabular-nums text-ink">
                    {formatAmount(booking.amountPaise)}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusPill status={booking.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
