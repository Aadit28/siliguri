import Constants from 'expo-constants';

type RequestOptions = {
  method?: 'GET' | 'POST';
  token?: string | null;
  body?: Record<string, unknown>;
};

const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
const configuredBase = process.env.EXPO_PUBLIC_API_BASE_URL || extra?.apiBaseUrl || '';

export function apiBaseUrl() {
  if (configuredBase) return configuredBase.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8788';
  }
  return '';
}

export async function backendRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('The auth server is not running. Check the API URL and deployment.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data as T;
}
