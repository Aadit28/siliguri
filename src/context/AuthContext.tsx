import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { backendRequest } from '../lib/backend';
import { clearMemory } from '../lib/memory';
import { clearFamilyForSelf } from '../lib/familySync';
import { matchDemoUser } from '../lib/demoAuth';

const DEMO_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type SaathiUser = {
  id: string;
  user_metadata?: {
    username?: string;
    phone_number?: string | null;
    full_name?: string;
    role?: string;
    city_id?: string | null;
  };
};

type SaathiSession = {
  access_token: string;
  expires_at?: string;
  user: SaathiUser;
};

interface AuthState {
  session: SaathiSession | null;
  user: SaathiUser | null;
  loading: boolean;
  displayName: string;
  isAdmin: boolean;
  isCityHelper: boolean;
  isCityStaff: boolean;
  role: string;
  signIn: (
    identifier: string,
    password: string,
    method?: AuthMethod,
  ) => Promise<{ error?: string }>;
  signUp: (
    identifier: string,
    password: string,
    fullName: string,
    method?: AuthMethod,
    phoneNumber?: string,
  ) => Promise<{ error?: string }>;
  requestOtp: (phone: string) => Promise<{ error?: string; devCode?: string }>;
  verifyOtp: (phone: string, code: string, fullName?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  /** Drops the local session without a backend round trip or memory wipe. */
  clearSession: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);
const SESSION_KEY = 'saathi.usernameSession';
export type AuthMethod = 'username' | 'phone';

function normalizeUsername(username: string) {
  return username.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizePhone(phone: string) {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : raw;
}

function inferAuthMethod(identifier: string, method?: AuthMethod): AuthMethod {
  if (method) return method;
  const raw = identifier.trim();
  const digits = raw.replace(/\D/g, '');
  const phoneLike = /^[+\d\s().-]+$/.test(raw) && digits.length >= 8;
  return phoneLike ? 'phone' : 'username';
}

function validateUsername(username: string) {
  if (!username) return 'Enter your username.';
  if (username.length < 3) return 'Username must be at least 3 characters.';
  if (username.length > 80) return 'Username is too long.';
  return undefined;
}

function validatePhone(phone: string) {
  if (!phone) return 'Enter your phone number.';
  if (!/^\+\d{8,15}$/.test(phone)) return 'Enter a valid phone number.';
  return undefined;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SaathiSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then(async (stored) => {
        if (!stored) return;
        const saved = JSON.parse(stored) as SaathiSession;
        if (saved.expires_at && new Date(saved.expires_at).getTime() <= Date.now()) {
          await AsyncStorage.removeItem(SESSION_KEY);
          return;
        }
        setSession(saved);
        // Offline demo sessions (`demo.<id>`) are device-local by design: the
        // backend has no such token and would answer 401, which used to wipe a
        // still-valid demo session on every launch. Keep it and let the screens
        // that need a real token handle their own 401 (audit finding 7).
        if (saved.access_token.startsWith('demo.')) return;
        try {
          const { user: freshUser } = await backendRequest<{ user: SaathiUser }>(
            '/api/auth/me',
            { token: saved.access_token },
          );
          setSession((current) =>
            current?.access_token === saved.access_token ? { ...saved, user: freshUser } : current,
          );
        } catch (error) {
          const status = (error as { status?: number }).status;
          // Only clear on a definitive auth rejection; keep the session when
          // the backend is unreachable (offline/timeout) so users stay signed in.
          if (status === 401 || status === 403) {
            setSession((current) =>
              current?.access_token === saved.access_token ? null : current,
            );
            await AsyncStorage.removeItem(SESSION_KEY);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const user = session?.user ?? null;
  const displayName =
    (user?.user_metadata?.full_name as string) ||
    (user?.user_metadata?.username as string) ||
    '';
  const role = (user?.user_metadata?.role as string) || 'user';
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isCityHelper = role === 'city_helper';
  const isCityStaff = isAdmin || isCityHelper;

  async function signIn(identifier: string, password: string, method?: AuthMethod) {
    if (!identifier.trim()) return { error: 'Enter your username or phone number.' };

    // Demo accounts also exist as real backend rows (scripts/seed-demo-accounts.mjs).
    // Try the backend first so demo users get real tokens (family/admin APIs work);
    // fall back to the offline demo session only when the backend cannot sign
    // them in (unreachable, or rows not seeded yet).
    const demo = matchDemoUser(identifier, password);

    const resolvedMethod = inferAuthMethod(identifier, method);
    const normalizedIdentifier =
      resolvedMethod === 'phone' ? normalizePhone(identifier) : normalizeUsername(identifier);
    const validationError =
      resolvedMethod === 'phone' ? validatePhone(normalizedIdentifier) : validateUsername(normalizedIdentifier);
    if (validationError && !demo) return { error: validationError };

    if (!validationError) {
      try {
        const { session: nextSession } = await backendRequest<{ session: SaathiSession }>(
          '/api/auth/signin',
          {
            method: 'POST',
            body:
              resolvedMethod === 'phone'
                ? { phone: normalizedIdentifier, password }
                : { username: normalizedIdentifier, password },
          },
        );
        if (!nextSession?.access_token || !nextSession.user) {
          throw new Error('Sign in did not return an account session.');
        }
        setSession(nextSession);
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
        return {};
      } catch (error) {
        if (!demo) return { error: (error as Error).message };
      }
    }

    // Offline demo fallback — same credentials, device-local session.
    if (!demo) return { error: 'Sign in failed.' };
    const demoSession: SaathiSession = {
      access_token: `demo.${demo.id}`,
      expires_at: new Date(Date.now() + DEMO_SESSION_TTL_MS).toISOString(),
      user: {
        id: demo.id,
        user_metadata: {
          username: demo.username,
          full_name: demo.fullName,
          phone_number: demo.phone,
          role: demo.role,
          city_id: null,
        },
      },
    };
    setSession(demoSession);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(demoSession));
    return {};
  }

  async function signUp(
    identifier: string,
    password: string,
    fullName: string,
    method?: AuthMethod,
    phoneNumber?: string,
  ) {
    const resolvedMethod = inferAuthMethod(identifier, method);
    const normalizedIdentifier =
      resolvedMethod === 'phone' ? normalizePhone(identifier) : normalizeUsername(identifier);
    const normalizedPhone = phoneNumber?.trim() ? normalizePhone(phoneNumber) : '';
    const validationError =
      (resolvedMethod === 'phone' ? validatePhone(normalizedIdentifier) : validateUsername(normalizedIdentifier)) ||
      (normalizedPhone ? validatePhone(normalizedPhone) : undefined);
    if (validationError) return { error: validationError };

    try {
      const { session: nextSession } = await backendRequest<{ session: SaathiSession }>(
        '/api/auth/signup',
        {
          method: 'POST',
          body:
            resolvedMethod === 'phone'
              ? { phone: normalizedIdentifier, username: normalizedIdentifier, password, fullName }
              : {
                  username: normalizedIdentifier,
                  phone: normalizedPhone || undefined,
                  password,
                  fullName,
                },
        },
      );
      if (!nextSession?.access_token || !nextSession.user) {
        throw new Error('Account was not created. Check the backend setup.');
      }
      setSession(nextSession);
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      return {};
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async function requestOtp(phone: string) {
    const normalized = normalizePhone(phone);
    const validationError = validatePhone(normalized);
    if (validationError) return { error: validationError };
    try {
      const { devCode } = await backendRequest<{ sent: boolean; devCode?: string }>(
        '/api/auth/otp-request',
        { method: 'POST', body: { phone: normalized } },
      );
      return { devCode };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async function verifyOtp(phone: string, code: string, fullName?: string) {
    const normalized = normalizePhone(phone);
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) return { error: 'Enter the 6-digit code.' };
    try {
      const { session: nextSession } = await backendRequest<{ session: SaathiSession }>(
        '/api/auth/otp-verify',
        { method: 'POST', body: { phone: normalized, code: digits, fullName: fullName?.trim() || undefined } },
      );
      if (!nextSession?.access_token || !nextSession.user) {
        throw new Error('Sign in did not return an account session.');
      }
      setSession(nextSession);
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      return {};
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async function clearSession() {
    setSession(null);
    await AsyncStorage.removeItem(SESSION_KEY);
  }

  async function signOut() {
    const token = session?.access_token;
    setSession(null);
    await AsyncStorage.removeItem(SESSION_KEY);
    // Assistant memory is stored device-wide; clear it so the next account
    // on a shared family device does not inherit this user's chats/facts.
    await clearMemory().catch(() => undefined);
    // Same reason: the mirrored family reminders (and their scheduled alerts)
    // belong to this user's wards, not to whoever signs in next.
    await clearFamilyForSelf().catch(() => undefined);
    if (token) {
      await backendRequest('/api/auth/signout', { method: 'POST', token }).catch(() => undefined);
    }
  }

  return (
    <AuthContext.Provider
      value={{ session, user, loading, displayName, isAdmin, isCityHelper, isCityStaff, role, signIn, signUp, requestOtp, verifyOtp, signOut, clearSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
