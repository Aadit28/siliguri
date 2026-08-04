"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle, SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { Reveal } from "./Reveal";

const roles = [
  { value: "family", label: "My parents live in Siliguri" },
  { value: "elder", label: "I live in Siliguri myself" },
  { value: "partner", label: "I work for a city or an NGO" },
];

type Status = "idle" | "sending" | "sent";

const field =
  "h-14 w-full rounded-[10px] border border-line bg-paper px-4 text-[16px] text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none";

export function Waitlist() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          role: data.get("role"),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch {
      setError("We could not reach the server. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <section id="waitlist" className="scroll-mt-[80px] mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:py-32">
      <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-20">
        <Reveal className="lg:col-span-5">
          <h2 className="text-[32px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[42px]">
            Siliguri first. Then the next city.
          </h2>
          <p className="mt-5 max-w-[44ch] text-[17px] leading-relaxed text-ink-muted">
            The pilot is small on purpose: a real directory, real families, and
            enough attention to fix what breaks. Tell us where you fit and we
            will get in touch when there is a place for you.
          </p>
          <dl className="mt-10 divide-y divide-line border-y border-line text-[15px]">
            {[
              ["Runs on", "iPhone, Android and any browser"],
              ["Languages", "Hindi by default, English one tap away"],
              ["Costs", "Nothing during the pilot"],
            ].map(([term, value]) => (
              <div key={term} className="flex gap-6 py-4">
                <dt className="w-28 shrink-0 font-semibold">{term}</dt>
                <dd className="text-ink-muted">{value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal delay={0.08} className="lg:col-span-6 lg:col-start-7">
          {status === "sent" ? (
            <div className="flex h-full min-h-[280px] flex-col justify-center rounded-[16px] border border-line bg-paper-alt p-8">
              <CheckCircle
                size={40}
                weight="fill"
                className="text-chip-sageink"
              />
              <p className="mt-5 text-[22px] font-bold tracking-[-0.02em]">
                You are on the list.
              </p>
              <p className="mt-2 max-w-[42ch] text-[16px] leading-relaxed text-ink-muted">
                We will write from a Saathi address before the pilot opens. No
                newsletter, no forwarding your details on.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="grid gap-6">
              <div className="grid gap-2">
                <label htmlFor="name" className="text-[15px] font-semibold">
                  Your name
                </label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  required
                  className={field}
                  placeholder="Priya Sharma"
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="email" className="text-[15px] font-semibold">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={field}
                  placeholder="you@example.com"
                />
                <p className="text-[14px] text-ink-subtle">
                  Used once, to tell you the pilot has opened.
                </p>
              </div>

              <fieldset className="grid gap-3">
                <legend className="mb-1 text-[15px] font-semibold">
                  Who is this for?
                </legend>
                {roles.map((r, i) => (
                  <label
                    key={r.value}
                    className="flex min-h-14 cursor-pointer items-center gap-3 rounded-[10px] border border-line px-4 text-[16px] transition-colors has-checked:border-brand has-checked:bg-brand-soft"
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      defaultChecked={i === 0}
                      className="size-5 accent-[#276EF1]"
                    />
                    {r.label}
                  </label>
                ))}
              </fieldset>

              {error && (
                <p role="alert" className="text-[15px] font-medium text-emergency">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "sending"}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-ink px-8 text-[16px] font-semibold text-paper transition-transform hover:bg-black active:translate-y-px disabled:opacity-60"
              >
                {status === "sending" && (
                  <SpinnerGap size={20} weight="bold" className="animate-spin" />
                )}
                {status === "sending" ? "Sending" : "Get early access"}
              </button>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}
