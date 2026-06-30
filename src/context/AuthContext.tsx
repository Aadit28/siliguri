import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { backendRequest } from '../lib/backend';
import { supabaseConfigured } from '../lib/supabase';

type SaathiUser = {
  id: string;
  user_metadata?: {
    username?: string;
    full_name?: string;
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
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  signUp: (username: string, password: string, fullName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);
const SESSION_KEY = 'saathi.usernameSession';

function normalizeUsername(username: string) {
  return username.trim().replace(/\s+/g, ' ').toLowerCase();
}

function validateUsername(username: string) {
  if (!username) return 'Enter your username.';
  if (username.length < 3) return 'Username must be at least 3 characters.';
  if (username.length > 80) return 'Username is too long.';
  return undefined;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SaathiSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    AsyncStorage.getItem(SESSION_KEY)
      .then(async (stored) => {
        if (!stored) return;
        const saved = JSON.parse(stored) as SaathiSession;
        setSession(saved);
        const { user: freshUser } = await backendRequest<{ user: SaathiUser }>(
          '/api/auth/me',
          { token: saved.access_token },
        );
        setSession((current) =>
          current?.access_token === saved.access_token ? { ...saved, user: freshUser } : current,
        );
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const user = session?.user ?? null;
  const displayName =
    (user?.user_metadata?.full_name as string) ||
    (user?.user_metadata?.username as string) ||
    '';

  async function signIn(username: string, password: string) {
    const normalizedUsername = normalizeUsername(username);
    const validationError = validateUsername(normalizedUsername);
    if (validationError) return { error: validationError };

    try {
      const { session: nextSession } = await backendRequest<{ session: SaathiSession }>(
        '/api/auth/signin',
        { method: 'POST', body: { username: normalizedUsername, password } },
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

  async function signUp(username: string, password: string, fullName: string) {
    const normalizedUsername = normalizeUsername(username);
    const validationError = validateUsername(normalizedUsername);
    if (validationError) return { error: validationError };

    try {
      const { session: nextSession } = await backendRequest<{ session: SaathiSession }>(
        '/api/auth/signup',
        { method: 'POST', body: { username: normalizedUsername, password, fullName } },
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

  async function signOut() {
    const token = session?.access_token;
    setSession(null);
    await AsyncStorage.removeItem(SESSION_KEY);
    if (token) {
      await backendRequest('/api/auth/signout', { method: 'POST', token }).catch(() => undefined);
    }
  }

  return (
    <AuthContext.Provider
      value={{ session, user, loading, displayName, signIn, signUp, signOut }}
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
