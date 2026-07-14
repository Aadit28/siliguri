export type DisplayMode = 'phone' | 'computer';

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

  if (userAgent) {
    const mobileBrowser = /Android|iPhone|iPod|iPad|Mobile/i.test(userAgent);
    const touchIPad = /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
    return mobileBrowser || touchIPad ? 'phone' : 'computer';
  }

  return width <= 600 ? 'phone' : 'computer';
}
