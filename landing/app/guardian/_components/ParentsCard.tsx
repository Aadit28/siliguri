"use client";

import { ListChecks, Phone } from "@phosphor-icons/react/dist/ssr";
import type { ParentLink } from "../_lib/api";
import { formatDate, parentLabel, telHref } from "../_lib/format";
import { Card, CardHeader, EmptyState, ErrorState, LoadingRows } from "./ui";

type Phase = "loading" | "ready" | "error";

const LINK_TONE: Record<string, string> = {
  active: "bg-chip-sage text-chip-sageink",
  pending: "bg-chip-butter text-chip-butterink",
  revoked: "bg-paper-tint text-ink-subtle",
};

/**
 * Who this guardian actually looks after. Pending links are shown too — a code
 * that was never entered on the parent's phone is the usual reason a desk looks
 * empty, and hiding those rows hides the fix.
 */
export function ParentsCard({
  links,
  phase,
  error,
  onRetry,
  bookingCounts,
  activeFilterId,
  onFilter,
}: {
  links: ParentLink[];
  phase: Phase;
  error: string | null;
  onRetry: () => void;
  bookingCounts: Record<string, number>;
  activeFilterId: string | null;
  onFilter: (link: ParentLink) => void;
}) {
  return (
    <Card>
      <CardHeader eyebrow="Care circle" title="Parents" count={links.filter((l) => l.status === "active").length} />

      {phase === "loading" && <LoadingRows rows={2} />}
      {phase === "error" && error && <ErrorState message={error} onRetry={onRetry} />}

      {phase === "ready" && links.length === 0 && (
        <EmptyState
          title="No parents linked"
          body="Open Saathi on your phone, send a link code to your parent's WhatsApp, and they appear here once they enter it."
        />
      )}

      {phase === "ready" && links.length > 0 && (
        <ul className="divide-y divide-line">
          {links.map((link) => {
            const name = parentLabel(link.parentName, link.parentPhone);
            const tel = telHref(link.parentPhone);
            const isActive = link.status === "active" && Boolean(link.parentId);
            const filtered = activeFilterId !== null && activeFilterId === link.parentId;
            const count = link.parentId ? bookingCounts[link.parentId] ?? 0 : 0;

            return (
              <li key={link.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                      {name}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                          LINK_TONE[link.status] ?? LINK_TONE.revoked
                        }`}
                      >
                        {link.status}
                      </span>
                    </p>
                    <p className="mt-1 text-[13px] text-ink-subtle">
                      {link.relationship ? `${link.relationship} · ` : ""}
                      {link.status === "active"
                        ? `Linked ${formatDate(link.verifiedAt ?? link.createdAt)}`
                        : `Invited ${formatDate(link.createdAt)}`}
                      {isActive && ` · ${count} booking${count === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {tel ? (
                    <a
                      href={tel}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-ink hover:text-ink"
                    >
                      <Phone size={14} weight="bold" />
                      Call
                    </a>
                  ) : (
                    <span
                      title="No usable phone number on this link"
                      className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] font-semibold text-ink-subtle opacity-60"
                    >
                      <Phone size={14} weight="bold" />
                      No number
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={!isActive}
                    onClick={() => onFilter(link)}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      filtered
                        ? "bg-brand text-paper"
                        : "border border-line text-ink-muted hover:border-ink hover:text-ink"
                    }`}
                  >
                    <ListChecks size={14} weight="bold" />
                    {filtered ? "Showing bookings" : "View bookings"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
