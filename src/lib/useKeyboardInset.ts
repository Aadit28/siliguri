import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Height, in px, currently covered by the on-screen keyboard.
 *
 * Two different problems wearing the same name:
 *
 * NATIVE — `Keyboard` events report the frame directly. `keyboardWillShow`
 * fires before the animation on iOS so the layout moves with the keyboard
 * rather than after it; Android only has `keyboardDidShow`.
 *
 * WEB — this is the one that actually bites. Mobile Safari does NOT shrink the
 * layout viewport when the keyboard opens, so a bottom-pinned composer stays
 * exactly where it was and the keyboard draws straight over it. Nothing in the
 * React Native layout model notices. `visualViewport` is the only surface that
 * reports it: the gap between the visual viewport's bottom edge and the layout
 * viewport's is the covered height.
 *
 * Returns 0 when nothing is covered, so callers can add it to padding
 * unconditionally.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = (globalThis as any).visualViewport;
      if (!vv) return;

      const update = () => {
        // offsetTop matters when the page is pinch-zoomed or scrolled under the
        // visual viewport; without it the inset over-reports and the composer
        // jumps well above the keyboard.
        const covered = window.innerHeight - vv.height - vv.offsetTop;
        // Small deltas are browser chrome (the URL bar collapsing), not a
        // keyboard. 90px is comfortably below any real keyboard.
        setInset(covered > 90 ? Math.round(covered) : 0);
      };

      update();
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      return () => {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      };
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      setInset(Math.round(event.endCoordinates?.height ?? 0));
    });
    const hide = Keyboard.addListener(hideEvent, () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}
