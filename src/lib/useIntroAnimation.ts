import type { RefObject } from 'react';

/**
 * Native no-op. The web build resolves useIntroAnimation.web.ts instead, which
 * drives the onboarding entrance with a GSAP timeline.
 *
 * GSAP animates DOM nodes, so it cannot run under React Native's native
 * renderer. On iOS and Android the same screen keeps its Reanimated `entering`
 * transition — see the Platform check in app/onboarding.tsx.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useIntroAnimation(_scope: RefObject<unknown>, _stepKey: string): void {}
