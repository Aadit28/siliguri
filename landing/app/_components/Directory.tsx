import {
  Broom,
  Bus,
  FirstAid,
  HandHeart,
  Hospital,
  Pill,
  Stethoscope,
  Wrench,
} from "@phosphor-icons/react/dist/ssr";
import { Reveal } from "./Reveal";

// Counts are the live Siliguri dataset shipped with the app; they add up to the
// 58 quoted in the headline. Do not round them for looks.
const categories = [
  { icon: HandHeart, label: "Elder care & homes", count: 6, tone: "sage" },
  { icon: Stethoscope, label: "Doctors", count: 6, tone: "sky" },
  { icon: Hospital, label: "Hospitals", count: 7, tone: "peach" },
  { icon: Pill, label: "Medical shops", count: 14, tone: "lilac" },
  { icon: Bus, label: "Travel & transport", count: 6, tone: "butter" },
  { icon: Wrench, label: "Home services", count: 6, tone: "sage" },
  { icon: Broom, label: "Daily & civic help", count: 13, tone: "sky" },
] as const;

const tones = {
  sage: "bg-chip-sage text-chip-sageink",
  sky: "bg-chip-sky text-chip-skyink",
  peach: "bg-chip-peach text-chip-peachink",
  lilac: "bg-chip-lilac text-chip-lilacink",
  butter: "bg-chip-butter text-chip-butterink",
} as const;

export function Directory() {
  return (
    <section id="directory" className="scroll-mt-[80px] border-t border-line bg-paper-alt py-24 lg:py-32">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <Reveal>
          <p className="text-[13px] font-medium tracking-[0.14em] text-ink-subtle uppercase">
            The directory
          </p>
          <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="max-w-[16ch] text-[32px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[42px]">
              58 listings someone actually checked.
            </h2>
            <p className="max-w-[38ch] text-[16px] leading-relaxed text-ink-muted">
              Search it, call from it, save the ones your family will need
              again. It keeps working offline from a bundled copy of the
              Siliguri data.
            </p>
          </div>
        </Reveal>
      </div>

      {/* Horizontal rail rather than a seven-row list: the point is breadth, and
          seven stacked rows with hairlines would read as a spec sheet. */}
      <Reveal delay={0.08}>
        <ul className="no-scrollbar mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:px-8 lg:px-[max(2rem,calc((100vw-1240px)/2+2rem))]">
          {categories.map(({ icon: Icon, label, count, tone }) => (
            <li
              key={label}
              className="w-[228px] shrink-0 snap-start rounded-[16px] border border-line bg-paper p-6"
            >
              <span
                className={`grid size-12 place-items-center rounded-[10px] ${tones[tone]}`}
              >
                <Icon size={24} weight="regular" />
              </span>
              <p className="mt-14 text-[40px] leading-none font-bold tracking-[-0.04em] tabular-nums">
                {count}
              </p>
              <p className="mt-2 text-[16px] font-medium text-ink-muted">
                {label}
              </p>
            </li>
          ))}
          <li
            className="flex w-[228px] shrink-0 snap-start flex-col justify-end rounded-[16px] border border-dashed border-line p-6 text-ink-subtle"
            aria-hidden
          >
            <FirstAid size={24} weight="regular" />
            <p className="mt-6 text-[15px] leading-relaxed">
              More categories open as the pilot grows.
            </p>
          </li>
        </ul>
      </Reveal>
    </section>
  );
}
