/**
 * BestMe — Auth Context
 * =======================
 * Global state for authentication (JWT), login, registration,
 * and onboarding flow management.
 *
 * Tokens are persisted in the device keychain (expo-secure-store), so
 * closing the app no longer logs the user out.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import api, { type AuthTokens } from '../services/api';

// ── Storage keys ──────────────────────────────────────────────────

const ACCESS_TOKEN_KEY = 'bestme.accessToken';
const REFRESH_TOKEN_KEY = 'bestme.refreshToken';

// ── Types ─────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_percentage: number | null;
  activity_level: string | null;
  goal: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MetabolicProfile {
  bmr: number;
  equation_used: string;
  lean_mass_kg: number | null;
  tdee: number;
  calorie_target: number;
  macros: {
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    protein_kcal: number;
    carbs_kcal: number;
    fat_kcal: number;
  };
  activity_level: string;
  goal: string;
}

interface OnboardingData {
  date_of_birth: string;
  gender: string;
  height_cm: number;
  weight_kg: number;
  body_fat_percentage: number | null;
  activity_level: string;
  goal: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  needsOnboarding: boolean;
  metabolicProfile: MetabolicProfile | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: (data: OnboardingData) => Promise<void>;
  refreshMetabolicProfile: () => Promise<void>;
  updateProfile: (changes: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// ── Token persistence ─────────────────────────────────────────────

async function persistTokens(tokens: AuthTokens | null): Promise<void> {
  try {
    if (!tokens) {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      return;
    }
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
    if (tokens.refreshToken) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
    }
  } catch (error) {
    // A keychain failure must not break the session that's already running.
    console.warn('No se pudieron guardar los tokens:', error);
  }
}

async function loadTokens(): Promise<AuthTokens | null> {
  try {
    const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    if (!accessToken) return null;
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    return { accessToken, refreshToken };
  } catch {
    return null;
  }
}

// ── Helper: check if onboarding is needed ─────────────────────────

function checkNeedsOnboarding(user: User | null): boolean {
  if (!user) return false;
  return (
    !user.date_of_birth ||
    !user.gender ||
    !user.height_cm ||
    !user.weight_kg ||
    !user.goal
  );
}

// ── Provider ──────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [metabolicProfile, setMetabolicProfile] = useState<MetabolicProfile | null>(null);

  const segments = useSegments();
  const router = useRouter();

  const needsOnboarding = checkNeedsOnboarding(user);

  // Keeps the latest signOut available to the api client without
  // re-registering the callback on every render.
  const signOutRef = useRef<() => void>(() => {});

  const clearSession = useCallback(async () => {
    setUser(null);
    setMetabolicProfile(null);
    api.setTokens(null);
    await persistTokens(null);
  }, []);

  signOutRef.current = () => {
    void clearSession();
  };

  // Wire the api client to this context: it persists refreshed tokens
  // and signs the user out when the refresh token is dead too.
  useEffect(() => {
    api.setCallbacks({
      onTokensChanged: (tokens) => {
        void persistTokens(tokens);
      },
      onAuthFailure: () => signOutRef.current(),
    });
  }, []);

  const loadMetabolicProfile = useCallback(async () => {
    const res = await api.get<MetabolicProfile>('/metrics/profile');
    if (res.data && res.status === 200) {
      setMetabolicProfile(res.data);
    }
  }, []);

  const loadCurrentUser = useCallback(async (): Promise<User | null> => {
    const res = await api.get<User>('/auth/me');
    if (res.error || !res.data) return null;
    setUser(res.data);
    if (!checkNeedsOnboarding(res.data)) {
      await loadMetabolicProfile();
    }
    return res.data;
  }, [loadMetabolicProfile]);

  // ── Restore session on cold start ───────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const tokens = await loadTokens();
      if (tokens) {
        api.setTokens(tokens);
        const restored = await loadCurrentUser();
        if (!restored && !cancelled) {
          // Both tokens are dead — start clean.
          await clearSession();
        }
      }
      if (!cancelled) setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadCurrentUser, clearSession]);

  // ── Route guarding ──────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;

    const group = segments[0] as string | undefined;
    const inAuthGroup = group === '(auth)';
    const inOnboardingGroup = group === '(onboarding)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && needsOnboarding && !inOnboardingGroup) {
      router.replace('/(onboarding)/step-basics');
    } else if (user && !needsOnboarding && (inAuthGroup || inOnboardingGroup)) {
      router.replace('/(tabs)');
    }
  }, [user, segments, isLoading, needsOnboarding, router]);

  // ── Actions ─────────────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string) => {
      // The backend uses OAuth2PasswordRequestForm, which needs form encoding.
      const res = await api.postForm<{ access_token: string; refresh_token: string }>(
        '/auth/login',
        { username: email, password },
      );

      if (res.error || !res.data) {
        throw new Error(res.error ?? 'No se pudo iniciar sesión');
      }

      const tokens: AuthTokens = {
        accessToken: res.data.access_token,
        refreshToken: res.data.refresh_token,
      };
      api.setTokens(tokens);
      await persistTokens(tokens);

      const loaded = await loadCurrentUser();
      if (!loaded) {
        await clearSession();
        throw new Error('No se pudo cargar tu perfil');
      }
    },
    [loadCurrentUser, clearSession],
  );

  const register = useCallback(
    async (userData: any) => {
      const res = await api.post<User>('/auth/register', userData);
      if (res.error) throw new Error(res.error);
      await login(userData.email, userData.password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const completeOnboarding = useCallback(
    async (data: OnboardingData) => {
      const res = await api.post<{ message: string; metabolic_profile: MetabolicProfile }>(
        '/metrics/onboarding',
        data,
      );

      if (res.error || !res.data) {
        throw new Error(res.error ?? 'Error al completar el onboarding');
      }

      setMetabolicProfile(res.data.metabolic_profile);
      // Re-read the user so `needsOnboarding` reflects what the server stored.
      await loadCurrentUser();
    },
    [loadCurrentUser],
  );

  const updateProfile = useCallback(
    async (changes: Partial<User>) => {
      const res = await api.patch<User>('/auth/me', changes);
      if (res.error || !res.data) {
        throw new Error(res.error ?? 'No se pudo actualizar tu perfil');
      }
      setUser(res.data);
      // Weight/goal/activity all feed the metabolic engine.
      await loadMetabolicProfile();
    },
    [loadMetabolicProfile],
  );

  const refreshMetabolicProfile = useCallback(async () => {
    await loadMetabolicProfile();
  }, [loadMetabolicProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        needsOnboarding,
        metabolicProfile,
        login,
        register,
        logout,
        completeOnboarding,
        refreshMetabolicProfile,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
