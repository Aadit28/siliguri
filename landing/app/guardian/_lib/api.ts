/**
 * The one door between the guardian desk and the Saathi API.
 *
 * The desk is deployed as its own Vercel project (saathi-landing) while the API
 * lives on the main one, so every call here is cross-origin. server/_lib/auth.js
 * answers `Access-Control-Allow-Origin: *` with `Authorization` in the allowed
 * headers and no origin allow-list, which is what makes this possible — and it
 * is also why the token travels in a header rather than a cookie: a wildcard
 * origin forbids credentialed requests, so cookies would be dropped anyway.
 *
 * Every route funnels through request() so that error mapping happens once. The
 * API's 4xx bodies carry a message written for a person (sendServerError only
 * passes `publicError` through below 500), so those are shown verbatim; 5xx
 * bodies are deliberately generic and are replaced here.
 */

const DEFAULT_API_BASE = "https://saathi.vercel.app/api";

/**
 * Set NEXT_PUBLIC_SAATHI_API_BASE in the saathi-landing Vercel project to the
 * main app's API root, including the /api suffix. Inlined at build time, so a
 * change needs a redeploy of the landing project, not just an env edit.
 */
export const API_BASE = (
  process.env.NEXT_PUBLIC_SAATHI_API_BASE || DEFAULT_API_BASE
).replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = 12000;

export type ApiErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "invalid"
  | "offline"
  | "server";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  /** Machine-readable business code (hold_expired, slot_full, …) when the API sends one. */
  readonly code?: string;

  constructor(kind: ApiErrorKind, status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.kind === "unauthorized";
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Try again.";
}

function mapError(status: number, body: { error?: string; code?: string }): ApiError {
  const fromServer = typeof body.error === "string" && body.error.trim() ? body.error.trim() : "";
  const code = typeof body.code === "string" && body.code ? body.code : undefined;

  if (status === 401) {
    return new ApiError("unauthorized", status, "Your session has ended. Sign in again.", code);
  }
  if (status === 403) {
    return new ApiError("forbidden", status, fromServer || "You do not have access to this.", code);
  }
  if (status === 404) {
    return new ApiError("not_found", status, fromServer || "That is no longer there.", code);
  }
  if (status === 409) {
    return new ApiError("conflict", status, fromServer || "Someone changed this a moment ago.", code);
  }
  if (status === 429) {
    return new ApiError("rate_limited", status, fromServer || "Too many attempts. Wait a few minutes.", code);
  }
  if (status >= 400 && status < 500) {
    return new ApiError("invalid", status, fromServer || "That request was not accepted.", code);
  }
  // 5xx messages are generic by design on the server; saying "please try again"
  // twice adds nothing, so the desk writes its own.
  return new ApiError("server", status, "Saathi had a problem at its end. Try again in a moment.", code);
}

type RequestOptions = {
  method?: "GET" | "POST";
  token?: string | null;
  body?: Record<string, unknown>;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      // No cookies to send, and a wildcard CORS origin would reject them.
      credentials: "omit",
      cache: "no-store",
    });
  } catch {
    // An aborted timeout and a dead network are the same thing to the guardian:
    // the desk could not reach Siliguri.
    throw new ApiError("offline", 0, "Could not reach Saathi. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!response.ok) throw mapError(response.status, payload);
  return payload as T;
}

/* ---------------------------------------------------------------- types --- */

export type GuardianUser = {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  role: string;
};

export type BookingStatus =
  | "held"
  | "pending_guardian"
  | "pending_vendor"
  | "confirmed"
  | "completed"
  | "cancelled_user"
  | "cancelled_vendor_timeout"
  | "expired";

export type Booking = {
  id: string;
  familyId: string | null;
  elderId: string | null;
  vendorId: string | null;
  slotId: string | null;
  status: BookingStatus;
  holdExpiresAt: string | null;
  amountPaise: number | null;
  idempotencyKey: string | null;
  createdBy: "app" | "voice_agent" | null;
  cityId: string | null;
  createdAt: string | null;
};

export type LinkStatus = "pending" | "active" | "revoked";

export type ParentLink = {
  id: string;
  status: LinkStatus;
  parentId: string | null;
  parentName: string | null;
  parentPhone: string | null;
  relationship: string | null;
  createdAt: string | null;
  verifiedAt: string | null;
};

export type Session = {
  token: string;
  expiresAt: string | null;
  user: GuardianUser;
};

type RawUser = {
  id: string;
  user_metadata?: {
    username?: string;
    full_name?: string;
    phone_number?: string | null;
    role?: string;
  };
};

function toUser(raw: RawUser): GuardianUser {
  const meta = raw.user_metadata ?? {};
  return {
    id: raw.id,
    username: meta.username ?? "",
    fullName: meta.full_name || meta.username || "Guardian",
    phone: meta.phone_number ?? null,
    role: meta.role ?? "user",
  };
}

/* ------------------------------------------------------------ endpoints --- */

/**
 * The API takes either `username` or `phone` and ignores the other, so the desk
 * has to decide which the guardian typed. Anything that is only digits and
 * phone punctuation is a number; usernames are validated to 3+ characters and
 * are never all digits in practice.
 */
export function looksLikePhone(identifier: string): boolean {
  return /^[+\d][\d\s\-().]{6,}$/.test(identifier.trim());
}

export async function signIn(identifier: string, password: string): Promise<Session> {
  const trimmed = identifier.trim();
  const body: Record<string, unknown> = looksLikePhone(trimmed)
    ? { phone: trimmed, password }
    : { username: trimmed, password };

  const data = await request<{
    session?: { access_token?: string; expires_at?: string; user?: RawUser };
  }>("/auth/signin", { method: "POST", body });

  const token = data.session?.access_token;
  const user = data.session?.user;
  if (!token || !user) {
    throw new ApiError("server", 200, "Saathi answered without a session. Try again.");
  }
  return { token, expiresAt: data.session?.expires_at ?? null, user: toUser(user) };
}

export async function fetchMe(token: string): Promise<GuardianUser> {
  const data = await request<{ user: RawUser }>("/auth/me", { token });
  return toUser(data.user);
}

/** Best effort: the desk drops its token whether or not the API answers. */
export async function signOut(token: string): Promise<void> {
  await request<{ ok: boolean }>("/auth/signout", { method: "POST", token, body: {} });
}

/**
 * Only the guardian side of family/link matters here — the desk exists for
 * people looking after someone else, not for elders looking at themselves.
 */
export async function fetchLinkedParents(token: string): Promise<ParentLink[]> {
  const data = await request<{ asGuardian?: ParentLink[] }>("/family/link", {
    method: "POST",
    token,
    body: { action: "list" },
  });
  return data.asGuardian ?? [];
}

/**
 * elderId is not optional in practice: bookings/mine answers 400 for a guardian
 * with more than one linked parent unless it is told which one, so the desk
 * always names the parent and merges the lists itself.
 */
export async function fetchBookings(token: string, elderId: string): Promise<Booking[]> {
  const data = await request<{ bookings?: Booking[] }>(
    `/bookings/mine?elderId=${encodeURIComponent(elderId)}`,
    { token },
  );
  return data.bookings ?? [];
}

/**
 * `approve` must be a real boolean — the API rejects anything else, and rightly:
 * the string "false" is truthy and would book the appointment the guardian just
 * declined.
 */
export async function answerBooking(
  token: string,
  bookingId: string,
  approve: boolean,
): Promise<Booking> {
  const data = await request<{ booking: Booking }>("/bookings/approve", {
    method: "POST",
    token,
    body: { bookingId, approve: approve === true },
  });
  return data.booking;
}
