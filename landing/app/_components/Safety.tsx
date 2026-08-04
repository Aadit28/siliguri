import Image from "next/image";
import { Phone } from "@phosphor-icons/react/dist/ssr";
import { Reveal } from "./Reveal";

const points = [
  {
    title: "Posts are read before they appear",
    body: "The community board is moderated. Nothing a stranger writes goes public in Siliguri until a human has looked at it.",
  },
  {
    title: "A guardian is linked, not assumed",
    body: "An adult child only sees a parent's activity after that parent has agreed to the link on their own phone.",
  },
  {
    title: "Staff see one city",
    body: "Admin queries are scoped by city, so operations staff never read another city's families.",
  },
];

export function Safety() {
  return (
    <section className="border-y border-line bg-paper-alt py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-14 px-5 sm:px-8 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-5">
          <div className="mx-auto w-[300px] overflow-hidden rounded-[26px] border-[7px] border-ink bg-paper shadow-[0_24px_60px_rgba(10,10,10,0.16)] lg:mx-0">
            <Image
              src="/shots/community.png"
              alt="The Saathi community board, showing that questions are reviewed before they appear publicly"
              width={390}
              height={844}
              sizes="300px"
              className="h-auto w-full"
            />
          </div>
        </Reveal>

        <div className="lg:col-span-7">
          <Reveal>
            <h2 className="max-w-[20ch] text-[32px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[42px]">
              The careful parts are the ones you cannot see.
            </h2>
          </Reveal>

          <dl className="mt-10 divide-y divide-line border-y border-line">
            {points.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.06}>
                <div className="py-6">
                  <dt className="text-[18px] font-semibold">{p.title}</dt>
                  <dd className="mt-2 max-w-[62ch] text-[16px] leading-relaxed text-ink-muted">
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
              <p className="text-[15px] leading-relaxed text-ink-muted">
                One tap from every screen. Saathi coordinates calls and next
                steps; it is not a medical device or an emergency responder.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
