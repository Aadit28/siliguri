"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut as apiSignOut, type GuardianUser, type Session } from "./api";

/**
 * The desk's token lives in sessionStorage, deliberately — not localStorage.
 *
 * This is a desk view: a guardian opens it on a laptop, answers what is waiting,
 * and closes the tab. sessionStorage dies with the tab, so a shared or office
 * machine does not keep a 30-day API token lying around after they walk away.
 *
 * The tradeoff is real and accepted: every new tab and every browser restart
 * costs a sign-in, and duplicating the tab carries the session across (Chrome
 * copies sessionStorage into a duplicated tab) while opening the URL fresh does
 * not. If the desk later grows into something a guardian keeps open all week,
 * the answer is a refresh-token cookie on the API's own origin, not a move to
 * localStorage.
 */
const STORAGE_KEY = "saathi.guardian.session";

export type StoredSession = {
  token: string;
  expiresAt: string | null;
  user: GuardianUser;
};

export function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed || typeof parsed.token !== "string" || !parsed.token || !parsed.user) return null;
    // A token whose own expiry has passed cannot succeed; dropping it here
    // sends the guardian to the sign-in form instead of to a 401.
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return {
      token: parsed.token,
      expiresAt: parsed.expiresAt ?? null,
      user: parsed.user as GuardianUser,
    };
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private-mode quota failures must not block the sign-in that just worked;
    // the guardian gets a session that lasts until the page is reloaded.
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — the token is already unreachable.
  }
}

export type SessionState =
  | { status: "loading"; session: null }
  | { status: "anon"; session: null }
  | { status: "authed"; session: StoredSession };

/**
 * Reads the stored session after mount, never during render: these pages are
 * prerendered at build time, where sessionStorage does not exist, and reading it
 * during render would also mismatch on hydration.
 */
export function useSession() {
  const router = useRouter();
  const [state, setState] = useState<SessionState>({ status: "loading", session: null });

  useEffect(() => {
    const stored = readSession();
    setState(stored ? { status: "authed", session: stored } : { status: "anon", session: null });
  }, []);

  /** Local sign-out for an expired token: no API call, the token is already dead. */
  const endSession = useCallback(
    (reason?: "expired") => {
      clearSession();
      setState({ status: "anon", session: null });
      router.replace(reason === "expired" ? "/guardian/login?expired=1" : "/guardian/login");
    },
    [router],
  );

  /** Deliberate sign-out: revoke the token server-side first, then forget it. */
  const signOut = useCallback(async () => {
    const token = state.session?.token;
    if (token) {
      // A failed revoke must not trap the guardian in a signed-in shell — the
      // token is dropped locally either way, and it expires on its own.
      await apiSignOut(token).catch(() => undefined);
    }
    clearSession();
    setState({ status: "anon", session: null });
    router.replace("/guardian/login");
  }, [router, state.session?.token]);

  return { ...state, endSession, signOut };
}
