"use client";

import { useRef } from "react";
import { useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import type { LottieRefCurrentProps } from "lottie-react";
import roses from "../_lib/lottie/monoline-roses.json";

// lottie-web touches window on load, so the player only ever loads on the
// client. Until then the slot is simply empty — it is decoration.
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

/**
 * "Monoline Roses" by Hannah Swanson, imported from LottieFiles (free Lottie
 * Simple License): three roses drawn in one continuous line each, looping.
 * The source animation is pink; the JSON's stroke colour is rebased to the
 * app's chip sage (#2e5d3c) so the flora sits in the product's own palette.
 * Vector all the way down — no video file, no background to knock out.
 *
 * Decorative only: hidden from the accessibility tree, no pointer events,
 * and reduced-motion readers get the finished still instead of the loop.
 */
export function FloraRoses({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<LottieRefCurrentProps>(null);

  return (
    <div aria-hidden="true" className={`pointer-events-none select-none ${className}`}>
      <Lottie
        lottieRef={ref}
        animationData={roses}
        loop={!reduce}
        autoplay={!reduce}
        // Frame 0 of a draw-on animation is an empty canvas, so a paused
        // player must sit on the last frame — the finished drawing.
        onDOMLoaded={() => {
          if (reduce) ref.current?.goToAndStop(119, true);
        }}
        className="h-full w-full"
      />
    </div>
  );
}
