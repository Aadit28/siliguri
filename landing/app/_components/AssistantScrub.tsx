"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "motion/react";
import {
  ArrowsClockwise,
  BellRinging,
  CheckCircle,
  Clock,
  Microphone,
} from "@phosphor-icons/react/dist/ssr";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const words = [
  "मुझे",
  "रोज़",
  "शाम",
  "8",
  "बजे",
  "बीपी",
  "की",
  "दवा",
  "याद",
  "दिलाना",
];

const fields = [
  { icon: BellRinging, label: "What", value: "बीपी की दवा", deva: true },
  { icon: Clock, label: "When", value: "8:00 PM", deva: false },
  { icon: ArrowsClockwise, label: "Repeats", value: "Every day", deva: false },
];

/**
 * The one scroll-driven moment on the page. It exists because the product's
 * core claim — a spoken Hindi sentence becomes a saved, ringing reminder — is a
 * transformation, and a transformation is the one thing a still image cannot
 * show. Everything else on this page stays still.
 */
export function AssistantScrub() {
  const root = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useGSAP(
    () => {
      if (reduce) return;

      // Pinning costs a full extra viewport of scroll. That trade is worth it on
      // a desktop screen where both halves are visible at once, and not worth it
      // on a phone where they are stacked and the pin just feels like a stall.
      const mm = gsap.matchMedia();

      mm.add("(min-width: 1024px)", () => {
        // Hidden before first paint so the saved-state pill never flashes over
        // the button it is supposed to replace.
        gsap.set(".scrub-saved", { opacity: 0 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "+=1800",
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });

        tl.from(".scrub-word", {
          opacity: 0.15,
          y: 8,
          stagger: 0.5,
          duration: 1,
          ease: "none",
        })
          .from(".scrub-card", { opacity: 0, y: 26, duration: 1.4 }, ">-0.5")
          .from(
            ".scrub-field",
            { opacity: 0, x: -14, stagger: 0.7, duration: 1 },
            "<0.4",
          )
          .from(".scrub-cta", { opacity: 0, y: 10, duration: 0.9 }, ">-0.2")
          .to(".scrub-cta", { opacity: 0, duration: 0.6 }, ">0.8")
          .fromTo(
            ".scrub-saved",
            { opacity: 0, scale: 0.96 },
            { opacity: 1, scale: 1, duration: 0.8 },
            "<0.2",
          )
          .to({}, { duration: 1.2 });
      });

      // Below the pin breakpoint the card is simply shown in its saved state.
      mm.add("(max-width: 1023px)", () => {
        gsap.set(".scrub-cta", { display: "none" });
      });
    },
    { scope: root, dependencies: [reduce] },
  );

  return (
    <div ref={root} className="border-y border-line bg-ink text-paper">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-14 px-5 py-20 sm:px-8 lg:min-h-[100dvh] lg:grid-cols-2 lg:gap-20">
        <div>
          <p className="text-[13px] font-medium tracking-[0.14em] text-white/55 uppercase">
            The assistant
          </p>
          <h2 className="mt-5 text-[32px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[42px]">
            Say it the way you would say it to your daughter.
          </h2>

          <div className="mt-10 rounded-[16px] border border-white/12 bg-white/[0.04] p-6 sm:p-7">
            <div className="flex items-center gap-2 text-[13px] font-medium text-white/55">
              <Microphone size={16} weight="fill" className="text-white/70" />
              Listening · hi-IN
            </div>
            <p className="deva mt-4 flex flex-wrap gap-x-2.5 gap-y-1 text-[26px] leading-[1.5] font-medium sm:text-[30px]">
              {words.map((w, i) => (
                <span key={`${w}-${i}`} className="scrub-word inline-block">
                  {w}
                </span>
              ))}
            </p>
            <p className="mt-4 text-[15px] text-white/55">
              &ldquo;Remind me to take my BP medicine every day at 8pm.&rdquo;
            </p>
          </div>

          <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-white/65">
            On the web build the mic dictates in Hindi or Indian English, and a
            spoken question gets a spoken answer back.
          </p>
        </div>

        <div className="relative">
          <div className="scrub-card mx-auto w-full max-w-[420px] rounded-[16px] border border-white/12 bg-white p-6 text-ink sm:p-7">
            <p className="text-[13px] font-medium tracking-[0.12em] text-ink-subtle uppercase">
              New reminder
            </p>

            <ul className="mt-5 divide-y divide-line">
              {fields.map(({ icon: Icon, label, value, deva }) => (
                <li
                  key={label}
                  className="scrub-field flex items-center gap-4 py-4"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-paper-tint">
                    <Icon size={20} weight="regular" />
                  </span>
                  <span className="text-[14px] font-medium text-ink-subtle">
                    {label}
                  </span>
                  <span
                    className={`ml-auto text-[18px] font-semibold ${deva ? "deva" : ""}`}
                  >
                    {value}
                  </span>
                </li>
              ))}
            </ul>

            {/* Without motion there is nothing to transform, so the card just
                shows where it lands. */}
            <div className="relative mt-6 h-14">
              {!reduce && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  className="scrub-cta absolute inset-0 grid h-14 w-full place-items-center rounded-full bg-ink text-[16px] font-semibold text-paper"
                >
                  Save reminder
                </button>
              )}
              <div
                className={`${reduce ? "" : "scrub-saved"} absolute inset-0 flex h-14 items-center justify-center gap-2.5 rounded-full bg-chip-sage text-[16px] font-semibold text-chip-sageink`}
              >
                <CheckCircle size={20} weight="fill" />
                Saved · rings at 8:00 PM
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
