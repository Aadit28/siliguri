import { backendRequest } from './backend';

// Server-alert inbox for the bell. Every server push writes one of these rows
// whether or not a device received it, so web users — who can never get push —
// still see "Beta added a reminder" and "SOS" alerts here.

export interface ServerAlert {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  createdAt: string;
  unread: boolean;
}

function isDemoToken(token?: string | null) {
  return !token || token.startsWith('demo.');
}

export async function fetchServerAlerts(
  token?: string | null,
): Promise<{ alerts: ServerAlert[]; unread: number }> {
  if (isDemoToken(token)) return { alerts: [], unread: 0 };
  try {
    return await backendRequest<{ alerts: ServerAlert[]; unread: number }>('/api/notify/alerts', {
      method: 'POST',
      token,
      body: {},
    });
  } catch {
    // Offline: the bell still shows local reminders.
    return { alerts: [], unread: 0 };
  }
}

export function markServerAlertsRead(token?: string | null): void {
  if (isDemoToken(token)) return;
  void backendRequest('/api/notify/alerts', {
    method: 'POST',
    token,
    body: { action: 'read' },
  }).catch(() => undefined);
}
