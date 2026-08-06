"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "../../_components/Wordmark";
import { errorMessage, looksLikePhone, signIn } from "../_lib/api";
import { readSession, writeSession } from "../_lib/session";
import { fieldClass } from "../_components/ui";

export default function GuardianLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const identifierRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Already holding a live token in this tab: skip the form.
    if (readSession()) {
      router.replace("/guardian");
      return;
    }
    // Read from location rather than useSearchParams: the hook forces the page
    // into a Suspense boundary at build time, and this is one optional flag.
    setExpired(new URLSearchParams(window.location.search).get("expired") === "1");
    identifierRef.current?.focus();
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await signIn(identifier, password);
      writeSession(session);
      router.replace("/guardian");
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  const ready = identifier.trim().length >= 3 && password.length >= 6;

  return (
    <div className="grid min-h-dvh place-items-center bg-paper-alt px-5 py-12">
      <div className="w-full max-w-[420px]">
        <a href="/" className="inline-flex" aria-label="Saathi home">
          <Wordmark />
        </a>

        <div className="mt-6 rounded-[16px] border border-line bg-paper p-7 sm:p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
            Guardian desk
          </p>
          <h1 className="mt-2 text-[28px] leading-[1.15] font-bold tracking-[-0.03em]">
            Sign in
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
            Same account as the Saathi app. Approve bookings and check on your parents from a
            bigger screen.
          </p>

          {expired && (
            <p
              role="status"
              className="mt-5 rounded-[10px] border border-line bg-paper-alt px-4 py-3 text-[14px] text-ink-muted"
            >
              Your desk session ended. Sign in again to carry on.
            </p>
          )}

          <form onSubmit={onSubmit} noValidate className="mt-6 grid gap-5">
            <div className="grid gap-2">
              <label htmlFor="identifier" className="text-[14px] font-semibold">
                Phone number or username
              </label>
              <input
                id="identifier"
                ref={identifierRef}
                name="identifier"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                disabled={busy}
                className={fieldClass}
                placeholder="+91 98000 00000"
              />
              <p className="text-[13px] text-ink-subtle">
                {/* The API takes one or the other, so the desk says which it read. */}
                {identifier.trim()
                  ? looksLikePhone(identifier)
                    ? "Reading this as a phone number."
                    : "Reading this as a username."
                  : "An Indian number works with or without +91."}
              </p>
            </div>

            <div className="grid gap-2">
              <label htmlFor="password" className="text-[14px] font-semibold">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={busy}
                className={fieldClass}
                placeholder="••••••"
              />
            </div>

            {error && (
              <p role="alert" className="text-[14px] leading-relaxed font-medium text-emergency">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !ready}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-7 text-[15px] font-semibold text-paper transition-colors hover:bg-black active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <SpinnerGap size={18} weight="bold" className="animate-spin" />
              ) : (
                <ArrowRight size={17} weight="bold" />
              )}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[13px] leading-relaxed text-ink-subtle">
          For guardians. Parents use the Saathi app on their own phone — this desk never asks
          for their password.
        </p>
      </div>
    </div>
  );
}
