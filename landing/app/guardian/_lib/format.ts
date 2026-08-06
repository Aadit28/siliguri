import type { BookingStatus } from "./api";

/**
 * Everything on this desk is stamped in Siliguri time, whatever timezone the
 * guardian is reading from. "Tuesday 9am" has to mean the parent's Tuesday 9am
 * or the whole view lies by five and a half hours.
 */
const IST = "Asia/Kolkata";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateOnly = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "—";
  return `${dateTime.format(value)} IST`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "—";
  return dateOnly.format(value);
}

/** Rupees, rounded — the API quotes whole-rupee amounts in paise. */
export function formatAmount(paise: number | null): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return "Not quoted";
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

type StatusTone = "wait" | "live" | "good" | "done" | "dead";

const STATUS: Record<BookingStatus, { label: string; tone: StatusTone }> = {
  held: { label: "Holding", tone: "wait" },
  pending_guardian: { label: "Needs you", tone: "wait" },
  pending_vendor: { label: "With provider", tone: "live" },
  confirmed: { label: "Confirmed", tone: "good" },
  completed: { label: "Completed", tone: "done" },
  cancelled_user: { label: "Cancelled", tone: "dead" },
  cancelled_vendor_timeout: { label: "Provider timed out", tone: "dead" },
  expired: { label: "Expired", tone: "dead" },
};

export function statusLabel(status: BookingStatus): string {
  return STATUS[status]?.label ?? status.replace(/_/g, " ");
}

export function statusTone(status: BookingStatus): StatusTone {
  return STATUS[status]?.tone ?? "done";
}

/** Digits only, with the country code kept — what a tel: link needs. */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.length >= 8 ? `tel:${cleaned}` : null;
}

/** "Amma", "Papa" — falls back to something a person can read. */
export function parentLabel(name: string | null, phone: string | null): string {
  if (name && name.trim()) return name.trim();
  if (phone) return phone;
  return "Linked parent";
}
