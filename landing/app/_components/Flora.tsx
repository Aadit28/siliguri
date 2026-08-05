"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Botanical line-work, drawn in code rather than dropped in as a video: an
 * alpha-channel flower loop would cost megabytes and never match the page's
 * ink, while strokes inherit currentColor and weigh nothing. The stems draw
 * themselves in once on view, then the whole spray sways like a plant on a
 * sill — slow enough to read as air movement, not as animation.
 *
 * Colour comes from the parent (text-chip-sageink at low opacity), so the
 * flora sits in the same sage family as the app's own chips.
 */

const draw = (delay: number, reduce: boolean | null) => ({
  initial: reduce ? undefined : { pathLength: 0, opacity: 0 },
  whileInView: { pathLength: 1, opacity: 1 },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 1.4, delay, ease: [0.4, 0, 0.2, 1] as const },
});

/** Five petals around a centre, one path each so they draw like pen strokes. */
function Bloom({
  cx,
  cy,
  scale = 1,
  delay,
  reduce,
}: {
  cx: number;
  cy: number;
  scale?: number;
  delay: number;
  reduce: boolean | null;
}) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
      {[0, 72, 144, 216, 288].map((angle, i) => (
        <motion.path
          key={angle}
          d="M 0 -4 C 5 -12, 3 -22, 0 -24 C -3 -22, -5 -12, 0 -4"
          transform={`rotate(${angle})`}
          {...draw(delay + i * 0.08, reduce)}
        />
      ))}
      <motion.circle
        r="3"
        fill="currentColor"
        stroke="none"
        initial={reduce ? undefined : { scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 0.9 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5, delay: delay + 0.5 }}
      />
    </g>
  );
}

/** A leaf as two mirrored arcs meeting at the tip. */
function Leaf({
  d,
  delay,
  reduce,
}: {
  d: string;
  delay: number;
  reduce: boolean | null;
}) {
  return <motion.path d={d} {...draw(delay, reduce)} />;
}

/**
 * The tall spray: three stems from one root, a bloom, a seed head and a bud.
 * Decorative only — hidden from the accessibility tree, no pointer events.
 */
export function FloraSpray({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <svg
      viewBox="0 0 300 420"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
      className={`pointer-events-none select-none ${className}`}
    >
      <motion.g
        style={{ transformOrigin: "110px 420px" }}
        animate={reduce ? undefined : { rotate: [-1.3, 1.3, -1.3] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Centre stem, crowned with the open bloom. */}
        <motion.path
          d="M 110 420 C 104 340, 138 268, 130 178"
          {...draw(0, reduce)}
        />
        <Bloom cx={130} cy={168} delay={0.9} reduce={reduce} />
        <Leaf
          d="M 116 330 C 96 322, 82 302, 84 284 C 102 292, 114 310, 116 330"
          delay={0.5}
          reduce={reduce}
        />
        <Leaf
          d="M 126 268 C 146 262, 160 244, 158 226 C 140 232, 128 250, 126 268"
          delay={0.7}
          reduce={reduce}
        />

        {/* Left stem: a seed head of bare dots, the quiet counterpoint. */}
        <motion.path
          d="M 110 420 C 84 356, 44 322, 52 244"
          {...draw(0.2, reduce)}
        />
        {[
          [52, 232],
          [42, 224],
          [62, 222],
          [50, 212],
          [60, 210],
        ].map(([x, y], i) => (
          <motion.circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r="2.4"
            fill="currentColor"
            stroke="none"
            initial={reduce ? undefined : { scale: 0, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 0.85 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.4, delay: 1 + i * 0.07 }}
          />
        ))}
        <Leaf
          d="M 82 352 C 64 348, 50 332, 50 316 C 68 322, 80 336, 82 352"
          delay={0.6}
          reduce={reduce}
        />

        {/* Right stem, ending in a closed bud. */}
        <motion.path
          d="M 110 420 C 140 362, 196 336, 210 272"
          {...draw(0.35, reduce)}
        />
        <motion.path
          d="M 210 266 C 204 254, 208 242, 214 238 C 220 244, 220 258, 210 266"
          {...draw(1.1, reduce)}
        />
        <Leaf
          d="M 162 352 C 176 338, 180 318, 172 304 C 158 316, 156 338, 162 352"
          delay={0.8}
          reduce={reduce}
        />

        {/* Grass at the root, so the stems grow out of something. */}
        <motion.path d="M 96 420 C 92 404, 80 396, 70 394" {...draw(0.5, reduce)} />
        <motion.path d="M 124 420 C 130 406, 142 400, 152 400" {...draw(0.6, reduce)} />
      </motion.g>
    </svg>
  );
}

/** The small sprig: one stem, one bloom, two leaves. For section corners. */
export function FloraSprig({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <svg
      viewBox="0 0 160 200"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      className={`pointer-events-none select-none ${className}`}
    >
      <motion.g
        style={{ transformOrigin: "70px 200px" }}
        animate={reduce ? undefined : { rotate: [1.6, -1.6, 1.6] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.path
          d="M 70 200 C 66 152, 92 112, 86 62"
          {...draw(0, reduce)}
        />
        <Bloom cx={86} cy={54} scale={0.85} delay={0.7} reduce={reduce} />
        <Leaf
          d="M 74 156 C 58 150, 48 134, 50 120 C 66 126, 74 140, 74 156"
          delay={0.4}
          reduce={reduce}
        />
        <Leaf
          d="M 84 108 C 100 102, 110 86, 108 72 C 92 78, 84 92, 84 108"
          delay={0.55}
          reduce={reduce}
        />
      </motion.g>
    </svg>
  );
}
