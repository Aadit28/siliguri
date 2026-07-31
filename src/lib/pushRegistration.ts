import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { backendRequest } from './backend';

// Registers this device for server-sent push (guardian digests, family
// reminder alerts, help-desk updates). Local scheduled reminders work without
// any of this — see reminderNotifications.ts.
//
// Every step is best-effort: Expo Go on newer Android cannot mint a remote
// push token at all, web has no Expo push, and a denied permission is a normal
// answer. None of those may break sign-in.

let deviceToken: string | null = null;
// The auth token we last registered under, so a re-render does not re-POST.
let registeredFor: string | null = null;

async function fetchDeviceToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted) {
      if (!current.canAskAgain) return null;
      const asked = await Notifications.requestPermissionsAsync();
      if (!asked.granted) return null;
    }
    const projectId =
      (Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return result?.data ?? null;
  } catch {
    // Expo Go without a dev build, or a device without Play services.
    return null;
  }
}

export async function registerPushToken(authToken: string): Promise<void> {
  if (!authToken || authToken.startsWith('demo.')) return;
  if (registeredFor === authToken && deviceToken) return;
  const token = deviceToken ?? (await fetchDeviceToken());
  if (!token) return;
  deviceToken = token;
  try {
    await backendRequest('/api/notify/register', {
      method: 'POST',
      token: authToken,
      body: { token, platform: Platform.OS },
    });
    registeredFor = authToken;
  } catch {
    // Offline is fine — the next sign-in retries.
  }
}

// Sign-out on a shared family device: the next account must not receive the
// previous account's family alerts.
export async function unregisterPushToken(authToken: string): Promise<void> {
  const token = deviceToken;
  registeredFor = null;
  if (!token || !authToken || authToken.startsWith('demo.')) return;
  try {
    await backendRequest('/api/notify/register', {
      method: 'POST',
      token: authToken,
      body: { token, action: 'remove' },
    });
  } catch {
    // The server also drops tokens that stop resolving, so a missed
    // unregister self-heals.
  }
}
