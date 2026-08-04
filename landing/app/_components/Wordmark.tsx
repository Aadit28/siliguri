/**
 * The in-app mark: a near-black rounded square carrying an S, followed by the
 * wordmark in the product's own weight. Geometry only — no drawn illustration.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-[10px] bg-ink text-[17px] font-bold leading-none text-paper"
      >
        S
      </span>
      {!compact && (
        <span className="text-[19px] font-semibold tracking-[-0.02em]">
          Saathi
        </span>
      )}
    </span>
  );
}
