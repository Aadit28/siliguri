"use client";

import type { ReactNode } from "react";
import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "../../_components/Wordmark";
import type { GuardianUser } from "../_lib/api";

/**
 * The authed chrome. Deliberately thin: one bar with who you are and the way
 * out, and a wide working area under it. Guardians using this are working-age
 * and at a desk, so this is the one Saathi surface that is allowed to be dense.
 */
export function Shell({
  user,
  onSignOut,
  signingOut,
  children,
}: {
  user: GuardianUser;
  onSignOut: () => void;
  signingOut: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-paper-alt">
      <header className="sticky top-0 z-40 border-b border-line bg-paper">
        <div className="mx-auto flex h-[64px] max-w-[1240px] items-center gap-4 px-5 sm:px-8">
          <a href="/" className="shrink-0" aria-label="Saathi home">
            <Wordmark />
          </a>
          <span className="hidden h-5 w-px bg-line sm:block" />
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle sm:block">
            Guardian desk
          </span>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-[14px] font-semibold">{user.fullName}</p>
              <p className="text-[12px] text-ink-subtle">
                {user.phone || user.username || "Signed in"}
              </p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-[14px] font-semibold text-ink-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
            >
              <SignOut size={16} weight="bold" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}
