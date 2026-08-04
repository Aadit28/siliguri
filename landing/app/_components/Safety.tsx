"use client";

import { Phone } from "@phosphor-icons/react/dist/ssr";
import { useLang } from "../_lib/lang";
import { Reveal } from "./Reveal";
import { Device } from "./mockups/Device";
import { SceneAsk } from "./mockups/scenes";

export function Safety() {
  const { t, deva } = useLang();
  const s = t.safety;

  return (
    <section className="border-y border-line bg-paper-alt py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-14 px-5 sm:px-8 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-5">
          {/* The moderation queue itself, coded, so the claim beside it is
              illustrated by the state it describes: a post sitting in review. */}
          <div className="mx-auto w-[290px] rounded-[28px] border-[7px] border-ink bg-ink shadow-[0_24px_60px_rgba(10,10,10,0.16)] lg:mx-0">
            <Device tab="ask" className="h-[420px] rounded-[21px] border-0">
              <SceneAsk />
            </Device>
          </div>
        </Reveal>

        <div className="lg:col-span-7">
          <Reveal>
            <h2
              className={`max-w-[22ch] text-[32px] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[42px] ${deva}`}
            >
              {s.heading}
            </h2>
          </Reveal>

          <dl className="mt-10 divide-y divide-line border-y border-line">
            {s.points.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.06}>
                <div className="py-6">
                  <dt className={`text-[18px] font-semibold ${deva}`}>{p.title}</dt>
                  <dd className={`mt-2 max-w-[64ch] text-[16px] leading-relaxed text-ink-muted ${deva}`}>
                    {p.body}
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>

          {/* The only red on the page, spent on the only thing that warrants it. */}
          <Reveal delay={0.2}>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[16px] border border-emergency/25 bg-emergency-soft px-6 py-5">
              <span className="flex items-center gap-2.5 text-[19px] font-bold text-emergency">
                <Phone size={22} weight="fill" />
                SOS 112
              </span>
              <p className={`text-[15px] leading-relaxed text-ink-muted ${deva}`}>
                {s.sosBody}
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
