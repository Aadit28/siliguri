import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Remembers whether an account has seen the intro, and which portal it picked.
 *
 * Keyed per user id rather than per device on purpose: a Saathi phone is often
 * shared inside one family, so the son signing in after his mother must still
 * get his own guardian intro instead of inheriting hers.
 */

export type OnboardingKind = 'senior' | 'guardian';

const KEY_PREFIX = 'saathi.onboarding.v1.';

function keyFor(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

function isKind(value: string | null): value is OnboardingKind {
  return value === 'senior' || value === 'guardian';
}

/** The portal this account chose during onboarding, or null if never shown. */
export async function getOnboardingKind(userId: string): Promise<OnboardingKind | null> {
  try {
    const stored = await AsyncStorage.getItem(keyFor(userId));
    return isKind(stored) ? stored : null;
  } catch {
    // A storage failure must not block sign-in; treat it as "not seen yet".
    return null;
  }
}

export async function markOnboarded(userId: string, kind: OnboardingKind): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), kind);
  } catch {
    // Worst case the intro shows once more. Never surface this to the user.
  }
}

export async function clearOnboarding(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // Same reasoning as above.
  }
}
