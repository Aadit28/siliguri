"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle, SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { useLang } from "../_lib/lang";
import { FloraSprig } from "./Flora";
import { Reveal } from "./Reveal";

const ROLES = ["family", "elder", "partner", "city"] as const;
type Role = (typeof ROLES)[number];

type Status = "idle" | "sending" | "sent";

const field =
  "h-14 w-full rounded-[10px] border border-line bg-paper px-4 text-[16px] text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none";

export function Waitlist() {
  const { t, deva, lang } = useLang();
  const w = t.waitlist;

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("family");
  const cityInput = useRef<HTMLInputElement>(null);

  // "Request a city" in the directory rail is a link to this section; it also
  // flips the form to the matching option so the visitor lands on the field
  // they were promised instead of hunting for it.
  useEffect(() => {
    const onRequest = () => {
      setRole("city");
      setStatus("idle");
      window.setTimeout(() => cityInput.current?.focus(), 450);
    };
    window.addEventListener("saathi:request-city", onRequest);
    return () => window.removeEventListener("saathi:request-city", onRequest);
  }, []);

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
          role,
          city: data.get("city") ?? "",
          // Worth storing: it says which language to write back in.
          lang,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? w.genericError);
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch {
      setError(w.networkError);
      setStatus("idle");
    }
  }

  return (
    <section
      id="waitlist"
      className="relative scroll-mt-[80px] mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:py-32"
    >
      {/* The spray's echo: one sprig in the empty ground under the spec list,
          same sage, quieter. The form's column stays clear of decoration. */}
      <FloraSprig className="absolute bottom-16 left-6 hidden h-[160px] w-auto text-chip-sageink opacity-[0.32] lg:block" />

      <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-20">
        <Reveal className="lg:col-span-5">
          <h2
            className={`text-[32px] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[42px] ${deva}`}
          >
            {w.heading}
          </h2>
          <p className={`mt-5 max-w-[44ch] text-[17px] leading-relaxed text-ink-muted ${deva}`}>
            {w.body}
          </p>
          <dl className="mt-10 divide-y divide-line border-y border-line text-[15px]">
            {w.specs.map(([term, value]) => (
              <div key={term} className="flex gap-6 py-4">
                <dt className={`w-28 shrink-0 font-semibold ${deva}`}>{term}</dt>
                <dd className={`text-ink-muted ${deva}`}>{value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal delay={0.08} className="lg:col-span-6 lg:col-start-7">
          {status === "sent" ? (
            <div className="flex h-full min-h-[280px] flex-col justify-center rounded-[16px] border border-line bg-paper-alt p-8">
              <CheckCircle size={40} weight="fill" className="text-chip-sageink" />
              <p className={`mt-5 text-[22px] font-bold tracking-[-0.02em] ${deva}`}>
                {w.successTitle}
              </p>
              <p className={`mt-2 max-w-[42ch] text-[16px] leading-relaxed text-ink-muted ${deva}`}>
                {w.successBody}
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="grid gap-6">
              <div className="grid gap-2">
                <label htmlFor="name" className={`text-[15px] font-semibold ${deva}`}>
                  {w.nameLabel}
                </label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  required
                  className={`${field} ${deva}`}
                  placeholder={w.namePlaceholder}
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="email" className={`text-[15px] font-semibold ${deva}`}>
                  {w.emailLabel}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={field}
                  placeholder={w.emailPlaceholder}
                />
                <p className={`text-[14px] text-ink-subtle ${deva}`}>{w.emailHelp}</p>
              </div>

              <fieldset className="grid gap-3">
                <legend className={`mb-1 text-[15px] font-semibold ${deva}`}>
                  {w.roleLegend}
                </legend>
                {ROLES.map((value) => (
                  <label
                    key={value}
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-[10px] border px-4 text-[16px] transition-colors ${deva} ${
                      role === value
                        ? "border-brand bg-brand-soft"
                        : "border-line"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={value}
                      checked={role === value}
                      onChange={() => setRole(value)}
                      className="size-5 accent-[#276EF1]"
                    />
                    {w.roles[value]}
                  </label>
                ))}
              </fieldset>

              {role === "city" && (
                <div className="grid gap-2">
                  <label htmlFor="city" className={`text-[15px] font-semibold ${deva}`}>
                    {w.cityLabel}
                  </label>
                  <input
                    id="city"
                    name="city"
                    ref={cityInput}
                    required
                    className={`${field} ${deva}`}
                    placeholder={w.cityPlaceholder}
                  />
                </div>
              )}

              {error && (
                <p role="alert" className={`text-[15px] font-medium text-emergency ${deva}`}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "sending"}
                className={`inline-flex h-14 items-center justify-center gap-2 rounded-full bg-ink px-8 text-[16px] font-semibold text-paper transition-transform hover:bg-black active:translate-y-px disabled:opacity-60 ${deva}`}
              >
                {status === "sending" && (
                  <SpinnerGap size={20} weight="bold" className="animate-spin" />
                )}
                {status === "sending" ? w.sending : w.submit}
              </button>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}
