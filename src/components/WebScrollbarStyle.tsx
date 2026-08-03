import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';

/**
 * Replaces the browser's default scrollbar with a thin, trackless one.
 *
 * Windows Chrome draws a wide scrollbar with stepper arrows and a filled
 * track, which on a phone-width shell reads as a piece of desktop chrome
 * bolted to the side of the app. There is no React Native style for this —
 * scrollbars are only reachable from real CSS, so this writes one rule set
 * into the document.
 *
 * Native renders nothing: iOS and Android already draw an overlay scrollbar
 * that disappears when idle.
 */

const STYLE_ID = 'saathi-scrollbar';

export default function WebScrollbarStyle() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    // The thumb is the only visible part, so it carries the contrast on its
    // own: a track would put a permanent vertical rule down the edge of every
    // scrolling surface.
    const thumb = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(10,10,10,0.16)';
    const thumbHover = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(10,10,10,0.28)';

    let element = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!element) {
      element = document.createElement('style');
      element.id = STYLE_ID;
      document.head.appendChild(element);
    }

    element.textContent = `
      * {
        scrollbar-width: thin;
        scrollbar-color: ${thumb} transparent;
      }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb {
        background: ${thumb};
        border-radius: 999px;
      }
      ::-webkit-scrollbar-thumb:hover { background: ${thumbHover}; }
      ::-webkit-scrollbar-corner { background: transparent; }
      /* Steppers are the arrow buttons at each end — the most desktop-looking
         part of the default bar, and unusable at 6px wide anyway. */
      ::-webkit-scrollbar-button { display: none; }
      html { background: ${colors.frame}; }
    `;
  }, [colors.frame, isDark]);

  return null;
}
