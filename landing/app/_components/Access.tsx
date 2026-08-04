import { Reveal } from "./Reveal";

// Every figure here is a constant in the app's theme file, not a marketing round
// number: font.xs, TAP, and the contrast floor the palette was darkened to hit.
const stats = [
  {
    value: "15px",
    label: "Smallest type anywhere",
    note: "The scale floor was raised in measured steps for readers past 70.",
  },
  {
    value: "56px",
    label: "Minimum touch target",
    note: "Big enough for an unsteady hand on a bus.",
  },
  {
    value: "4.5:1",
    label: "Contrast floor, measured",
    note: "Greys were darkened until every one of them cleared WCAG AA.",
  },
  {
    value: "हिंदी",
    label: "Default language",
    deva: true,
    note: "English is one tap away, and the assistant answers in either.",
  },
];

export function Access() {
  return (
    <section id="access" className="scroll-mt-[80px] mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:py-32">
      <Reveal>
        <h2 className="max-w-[24ch] text-[32px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[42px]">
          Sized and worded for someone reading without their glasses on.
        </h2>
      </Reveal>

      <dl className="mt-16 grid grid-cols-1 gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.06}>
            <div className="border-t-2 border-ink pt-5">
              <dt
                className={`text-[46px] leading-none font-bold tracking-[-0.04em] ${s.deva ? "deva" : "tabular-nums"}`}
              >
                {s.value}
              </dt>
              <dd className="mt-4 text-[16px] font-semibold">{s.label}</dd>
              <dd className="mt-2 text-[15px] leading-relaxed text-ink-muted">
                {s.note}
              </dd>
            </div>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}
