export type DisplayMode = 'phone' | 'computer';

// The width of the app itself in phone mode. Shared so the shell in
// app/_layout and the modal overlays (which web renders outside that shell)
// cannot drift apart.
export const PHONE_MAX_WIDTH = 480;

export function automaticDisplayMode({
  width,
  userAgent,
  maxTouchPoints = 0,
  runtimeOS = process.env.EXPO_OS,
}: {
  width: number;
  userAgent?: string;
  maxTouchPoints?: number;
  runtimeOS?: string;
}): DisplayMode {
  if (runtimeOS !== 'web') return 'phone';

  // Narrow windows always get the phone layout, regardless of user agent —
  // the desktop nav cannot physically fit below 600px.
  if (width <= 600) return 'phone';

  if (userAgent) {
    const mobileBrowser = /Android|iPhone|iPod|iPad|Mobile/i.test(userAgent);
    const touchIPad = /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
    return mobileBrowser || touchIPad ? 'phone' : 'computer';
  }

  return 'computer';
}
