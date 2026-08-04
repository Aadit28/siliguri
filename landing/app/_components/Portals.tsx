import Image from "next/image";
import { Buildings, HouseLine, UsersThree } from "@phosphor-icons/react/dist/ssr";
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
    <span
      className={`grid size-11 place-items-center rounded-[10px] ${tones[tone]}`}
    >
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
  return (
    <section id="how" className="scroll-mt-[80px] mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:py-32">
      <Reveal>
        <h2 className="max-w-[20ch] text-[32px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[42px]">
          One app, three people signed into it.
        </h2>
        <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-ink-muted">
          Who you are decides what you see. The elder never has to learn the
          guardian&apos;s screens, and city staff never see another
          city&apos;s families.
        </p>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Reveal delay={0.05} className="lg:col-span-7">
          <article className={`${cardBase} flex h-full flex-col`}>
            <Chip tone="sky">
              <HouseLine size={22} weight="regular" />
            </Chip>
            <h3 className="mt-6 text-[26px] font-bold tracking-[-0.02em]">
              Parent
            </h3>
            <p className="mt-1 text-[15px] font-medium text-ink-subtle">
              The elder, at home in Siliguri
            </p>
            <p className="mt-4 max-w-[42ch] text-[16px] leading-relaxed text-ink-muted">
              Doctors, hospitals, medicine shops and transport that someone has
              actually checked. Ask for what you need in Hindi or English, by
              typing or out loud, and get a name and a number back.
            </p>
            <div className="mt-8 grid grow grid-cols-1 items-end gap-8 sm:grid-cols-[1fr_220px]">
              <ul className="space-y-3 self-start text-[15px] text-ink">
                {[
                  "Reminders that ring on one tap",
                  "Community board, moderated",
                  "Help desk that dials for you",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink" />
                    {item}
                  </li>
                ))}
              </ul>
              <ScreenPeek
                src="/shots/assistant.png"
                alt="The Saathi assistant screen, offering to book an appointment or find medicines"
                width={220}
              />
            </div>
          </article>
        </Reveal>

        <Reveal delay={0.12} className="lg:col-span-5">
          <article className={`${cardBase} flex h-full flex-col`}>
            <Chip tone="sage">
              <UsersThree size={22} weight="regular" />
            </Chip>
            <h3 className="mt-6 text-[26px] font-bold tracking-[-0.02em]">
              Guardian
            </h3>
            <p className="mt-1 text-[15px] font-medium text-ink-subtle">
              The adult child, anywhere
            </p>
            <p className="mt-4 text-[16px] leading-relaxed text-ink-muted">
              Link to a parent&apos;s account with their consent, then set
              reminders on their behalf, keep a care team of trusted numbers,
              and ask how the week has gone.
            </p>
            <div className="mt-auto flex justify-center pt-10">
              <ScreenPeek
                src="/shots/calendar.png"
                alt="A month calendar in Saathi with an upcoming events list"
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
              <h3 className="text-[22px] font-bold tracking-[-0.02em]">
                Admin
                <span className="ml-3 align-middle text-[15px] font-medium text-ink-subtle">
                  City operations staff
                </span>
              </h3>
              <p className="mt-2 max-w-[74ch] text-[16px] leading-relaxed text-ink-muted">
                Curates the directory, publishes announcements, works the
                callback queue and manages city helpers. Every query is scoped
                to one city, so staff in Siliguri only ever see Siliguri.
              </p>
            </div>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
