import { Platform } from 'react-native';

const LOGIN_INTENT_KEY = 'saathi.loginIntent.v1';

export function markLoginIntent() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(LOGIN_INTENT_KEY, '1');
  } catch {
    // Storage can be unavailable in private or locked-down browser sessions.
  }
}

export function consumeLoginIntent() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;

  try {
    const hasIntent = window.sessionStorage.getItem(LOGIN_INTENT_KEY) === '1';
    window.sessionStorage.removeItem(LOGIN_INTENT_KEY);
    return hasIntent;
  } catch {
    return false;
  }
}
