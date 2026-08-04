"use client";

import Image from "next/image";
import { Buildings, HouseLine, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { useLang } from "../_lib/lang";
import { Reveal } from "./Reveal";

function Chip({
  tone,
  children,
}: {
  tone: "sky" | "sage" | "butter";
  children: React.ReactNode;
}) {
  const tones = {
    sky: "bg-chip-sky text-chip-skyink",
    sage: "bg-chip-sage text-chip-sageink",
    butter: "bg-chip-butter text-chip-butterink",
  } as const;
  return (
    <span className={`grid size-11 place-items-center rounded-[10px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

/**
 * A real app screen cropped to a fixed window and anchored to the card's bottom
 * edge, so the two cards read as the same object at two widths instead of two
 * differently-scaled pictures.
 */
function ScreenPeek({
  src,
  alt,
  width,
  /** Pixels of the screenshot to hide at the top, in rendered units. */
  crop = 0,
}: {
  src: string;
  alt: string;
  width: number;
  crop?: number;
}) {
  const height = Math.round(width * 1.55);
  return (
    <div
      style={{ maxWidth: width, height }}
      className="-mb-7 w-full overflow-hidden rounded-t-[14px] border-x border-t border-line bg-paper-alt sm:-mb-8"
    >
      <Image
        src={src}
        alt={alt}
        width={390}
        height={844}
        sizes={`${width}px`}
        style={crop ? { marginTop: -crop } : undefined}
        className="h-auto w-full"
      />
    </div>
  );
}

const cardBase =
  "rounded-[16px] border border-line bg-paper p-7 sm:p-8 transition-shadow hover:shadow-[0_16px_40px_rgba(10,10,10,0.07)]";

export function Portals() {
  const { t, deva } = useLang();
  const p = t.portals;

  return (
    <section
      id="how"
      className="scroll-mt-[80px] mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:py-32"
    >
      <Reveal>
        <h2
          className={`max-w-[22ch] text-[32px] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[42px] ${deva}`}
        >
          {p.heading}
        </h2>
        <p className={`mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-muted ${deva}`}>
          {p.sub}
        </p>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Reveal delay={0.05} className="lg:col-span-7">
          <article className={`${cardBase} flex h-full flex-col`}>
            <Chip tone="sky">
              <HouseLine size={22} weight="regular" />
            </Chip>
            <h3 className={`mt-6 text-[26px] font-bold tracking-[-0.02em] ${deva}`}>
              {p.parent.title}
            </h3>
            <p className={`mt-1 text-[15px] font-medium text-ink-subtle ${deva}`}>
              {p.parent.role}
            </p>
            <p className={`mt-4 max-w-[44ch] text-[16px] leading-relaxed text-ink-muted ${deva}`}>
              {p.parent.body}
            </p>
            <div className="mt-8 grid grow grid-cols-1 items-end gap-8 sm:grid-cols-[1fr_220px]">
              <ul className={`space-y-3 self-start text-[15px] text-ink ${deva}`}>
                {p.parent.bullets.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink" />
                    {item}
                  </li>
                ))}
              </ul>
              <ScreenPeek src="/shots/assistant.png" alt={p.parent.shotAlt} width={220} />
            </div>
          </article>
        </Reveal>

        <Reveal delay={0.12} className="lg:col-span-5">
          <article className={`${cardBase} flex h-full flex-col`}>
            <Chip tone="sage">
              <UsersThree size={22} weight="regular" />
            </Chip>
            <h3 className={`mt-6 text-[26px] font-bold tracking-[-0.02em] ${deva}`}>
              {p.guardian.title}
            </h3>
            <p className={`mt-1 text-[15px] font-medium text-ink-subtle ${deva}`}>
              {p.guardian.role}
            </p>
            <p className={`mt-4 text-[16px] leading-relaxed text-ink-muted ${deva}`}>
              {p.guardian.body}
            </p>
            <div className="mt-auto flex justify-center pt-10">
              <ScreenPeek
                src="/shots/calendar.png"
                alt={p.guardian.shotAlt}
                width={220}
                // Skips the screenshot's own page-title row, which would
                // otherwise repeat "My Calendar" twice inside the card.
                crop={34}
              />
            </div>
          </article>
        </Reveal>

        <Reveal delay={0.18} className="lg:col-span-12">
          <article
            className={`${cardBase} flex flex-col gap-6 bg-paper-alt sm:flex-row sm:items-center sm:gap-10`}
          >
            <Chip tone="butter">
              <Buildings size={22} weight="regular" />
            </Chip>
            <div>
              <h3 className={`text-[22px] font-bold tracking-[-0.02em] ${deva}`}>
                {p.admin.title}
                <span className={`ml-3 align-middle text-[15px] font-medium text-ink-subtle ${deva}`}>
                  {p.admin.role}
                </span>
              </h3>
              <p className={`mt-2 max-w-[76ch] text-[16px] leading-relaxed text-ink-muted ${deva}`}>
                {p.admin.body}
              </p>
            </div>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
