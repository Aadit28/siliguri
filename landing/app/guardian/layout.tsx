import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The desk is a private tool that happens to be hosted on the marketing
 * project, so it is kept out of the index — nothing here is a landing page and
 * a signed-out crawler would only ever see the sign-in form.
 *
 * This layout stays a server component and does no gating: /guardian/login is
 * nested under it, and a gate here would bounce the sign-in page too. The
 * authed chrome lives in the client Shell that the dashboard mounts.
 */
export const metadata: Metadata = {
  title: "Guardian desk — Saathi",
  description: "Approve bookings and check in on your parents in Siliguri.",
  robots: { index: false, follow: false },
};

export default function GuardianLayout({ children }: { children: ReactNode }) {
  return children;
}
