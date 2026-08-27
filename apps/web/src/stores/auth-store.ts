import type { AuthTokens, User } from '@gtip/shared';
import { create } from 'zustand';

import { setTokenReader } from '../services/api-client';
import { login as loginRequest } from '../services/auth-service';

const STORAGE_KEY = 'gtip.auth';

interface PersistedSession {
  user: User;
  tokens: AuthTokens;
}

function readPersistedSession(): PersistedSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

function persistSession(session: PersistedSession | null): void {
  try {
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // A blocked localStorage only costs the user their "stay signed in".
  }
}

export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isSubmitting: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => void;
  clearError: () => void;
}

const initial = readPersistedSession();

export const useAuthStore = create<AuthState>((set) => ({
  user: initial?.user ?? null,
  tokens: initial?.tokens ?? null,
  isSubmitting: false,
  error: null,

  signIn: async (email, password) => {
    set({ isSubmitting: true, error: null });

    try {
      const session = await loginRequest(email, password);

      persistSession(session);
      set({ user: session.user, tokens: session.tokens, isSubmitting: false });

      return true;
    } catch (error) {
      set({
        isSubmitting: false,
        error:
          error instanceof Error
            ? error.message
            : 'Giriş yapılamadı. Lütfen tekrar deneyin.',
      });

      return false;
    }
  },

  signOut: () => {
    persistSession(null);
    set({ user: null, tokens: null, error: null });
  },

  clearError: () => set({ error: null }),
}));

// The API client reads the token straight from the store, so every request
// picks up a sign-in or sign-out without any component re-wiring.
setTokenReader(() => useAuthStore.getState().tokens?.accessToken ?? null);

export function selectIsAdmin(state: AuthState): boolean {
  return state.user?.role === 'admin';
}
