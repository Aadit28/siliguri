import Constants from 'expo-constants';

type RequestOptions = {
  method?: 'GET' | 'POST';
  token?: string | null;
  body?: Record<string, unknown>;
};

const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
const configuredBase = process.env.EXPO_PUBLIC_API_BASE_URL || extra?.apiBaseUrl || '';

function normalizeApiBase(base: string) {
  return base.replace(/^http:\/\/localhost(?=[:/]|$)/, 'http://127.0.0.1').replace(/\/$/, '');
}

export function apiBaseUrl() {
  if (typeof window !== 'undefined') {
    const { hostname, port } = window.location;
    const isIpv6Loopback = hostname === '::1' || hostname === '[::1]' || hostname === '0:0:0:0:0:0:0:1';
    const isLocalHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      isIpv6Loopback;
    const configuredIsLocal = /^http:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(?=[:/]|$)/.test(configuredBase);
    if (isIpv6Loopback && (!configuredBase || configuredIsLocal)) {
      return 'http://[::1]:8788';
    }
    if (isLocalHost || port === '8084') {
      return 'http://127.0.0.1:8788';
    }
  }
  if (configuredBase) return normalizeApiBase(configuredBase);
  return '';
}

export async function backendRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the local auth server. Refresh and try again.');
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('The auth server is not running. Check the API URL and deployment.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data as T;
}
