import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Re-runs `run` on a timer while the screen is focused and the app is in the
 * foreground, and once immediately whenever either of those becomes true again.
 *
 * Why this exists: a guardian and their senior are two separate devices, and
 * neither one is told when the other writes. Every family screen used to load
 * once on focus, so a reminder added from the guardian dashboard did not appear
 * on the senior's phone until they navigated away and back — invisible in a
 * side-by-side demo, and worse than invisible for a real family, where the
 * senior simply never looks away and back.
 *
 * Polling rather than Supabase Realtime: this app authenticates with its own
 * `auth_tokens` table, so `auth.uid()` is always null and the family tables
 * carry RLS with no policies (service-role only, by design). A Realtime
 * subscription from the client would need those tables readable by the anon
 * key, which would hand every signed-out visitor other families' medical
 * reminders. Polling keeps the server as the only reader.
 */

// Fast enough that a change lands within one breath during a demo, slow enough
// that a family screen left open all day is not hammering the API.
const DEFAULT_INTERVAL_MS = 6000;

export function useLivePoll(
  run: () => void,
  options: { intervalMs?: number; enabled?: boolean } = {},
): void {
  const { intervalMs = DEFAULT_INTERVAL_MS, enabled = true } = options;

  // Callers pass inline closures over fresh state. Holding the latest one in a
  // ref keeps the interval from being torn down and rebuilt on every render,
  // which would reset the clock and, at worst, never let it fire.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;

      let timer: ReturnType<typeof setInterval> | null = null;

      const stop = () => {
        if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };

      const start = () => {
        stop();
        // Fire now, not one interval from now: coming back to a screen should
        // show current data immediately.
        runRef.current();
        timer = setInterval(() => runRef.current(), intervalMs);
      };

      start();

      // Backgrounded apps and hidden browser tabs stop polling entirely. On web
      // this is what keeps a forgotten tab from making requests all night;
      // react-native-web maps AppState onto document visibility.
      const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'active') start();
        else stop();
      });

      return () => {
        stop();
        subscription.remove();
      };
    }, [enabled, intervalMs]),
  );
}
