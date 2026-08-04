import { Wordmark } from "./Wordmark";

export function Footer() {
  return (
    <footer className="border-t border-line bg-paper-alt">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-[38ch] text-[15px] leading-relaxed text-ink-muted">
            Elder care and local services for families in Siliguri, West Bengal.
            iOS, Android and web, in Hindi and English.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-8 gap-y-3 text-[15px] font-medium text-ink-muted">
          <a href="#how" className="transition-colors hover:text-ink">
            How it works
          </a>
          <a href="#directory" className="transition-colors hover:text-ink">
            Directory
          </a>
          <a href="#access" className="transition-colors hover:text-ink">
            Accessibility
          </a>
          <a href="#waitlist" className="transition-colors hover:text-ink">
            Get early access
          </a>
        </nav>
      </div>

      <div className="border-t border-line">
        <p className="mx-auto max-w-[1240px] px-5 py-6 text-[14px] text-ink-subtle sm:px-8">
          Saathi is a pilot. It coordinates calls and next steps, and is not a
          medical device, a doctor or an emergency responder.
        </p>
      </div>
    </footer>
  );
}
