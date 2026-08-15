/**
 * BestMe — Auth Context
 * =======================
 * Global state for authentication (JWT), login, registration,
 * and onboarding flow management.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import api from '../services/api';

// ── Types ─────────────────────────────────────────────────────────

interface User {
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

interface MetabolicProfile {
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
  token: string | null;
  isLoading: boolean;
  needsOnboarding: boolean;
  metabolicProfile: MetabolicProfile | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
  completeOnboarding: (data: OnboardingData) => Promise<void>;
  refreshMetabolicProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

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
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [metabolicProfile, setMetabolicProfile] = useState<MetabolicProfile | null>(null);

  const segments = useSegments();
  const router = useRouter();

  const needsOnboarding = checkNeedsOnboarding(user);

  useEffect(() => {
    // In a real app, we would load the token from SecureStore here.
    // For now, we simulate a loaded state with no user.
    setTimeout(() => {
      setIsLoading(false);
    }, 500);
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (!user && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/(auth)/login');
    } else if (user && needsOnboarding && !inOnboardingGroup) {
      // Redirect to onboarding if authenticated but profile incomplete
      router.replace('/(onboarding)/step-basics');
    } else if (user && !needsOnboarding && (inAuthGroup || inOnboardingGroup)) {
      // Redirect to home if fully set up
      router.replace('/(tabs)/');
    }
  }, [user, segments, isLoading, needsOnboarding]);

  const login = async (email: string, password: string) => {
    try {
      // Encode as URLSearchParams because OAuth2PasswordRequestForm expects form data
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const res = await fetch('http://localhost:8000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });
      
      if (!res.ok) {
        throw new Error('Login fallido');
      }
      
      const data = await res.json();
      setToken(data.access_token);
      api.setToken(data.access_token);
      
      // Fetch user profile
      const userRes = await api.get<User>('/auth/me');
      if (userRes.data) {
        setUser(userRes.data);

        // If profile is complete, load metabolic data
        if (!checkNeedsOnboarding(userRes.data)) {
          await loadMetabolicProfile();
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (userData: any) => {
    const res = await api.post<User>('/auth/register', userData);
    if (res.error) {
      throw new Error(res.error);
    }
    // After register, auto-login
    await login(userData.email, userData.password);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setMetabolicProfile(null);
    api.setToken(null);
    // SecureStore.deleteItemAsync('token');
  };

  const loadMetabolicProfile = async () => {
    try {
      const res = await api.get<MetabolicProfile>('/metrics/profile');
      if (res.data && res.status === 200) {
        setMetabolicProfile(res.data);
      }
    } catch (error) {
      console.error('Failed to load metabolic profile:', error);
    }
  };

  const completeOnboarding = async (data: OnboardingData) => {
    const res = await api.post<{ message: string; metabolic_profile: MetabolicProfile }>(
      '/metrics/onboarding',
      data,
    );

    if (res.error || !res.data) {
      throw new Error(res.error || 'Error al completar el onboarding');
    }

    // Update user locally with onboarding data
    if (user) {
      setUser({
        ...user,
        date_of_birth: data.date_of_birth,
        gender: data.gender,
        height_cm: data.height_cm,
        weight_kg: data.weight_kg,
        body_fat_percentage: data.body_fat_percentage,
        activity_level: data.activity_level,
        goal: data.goal,
      });
    }

    // Store the metabolic profile
    setMetabolicProfile(res.data.metabolic_profile);
  };

  const refreshMetabolicProfile = async () => {
    await loadMetabolicProfile();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        needsOnboarding,
        metabolicProfile,
        login,
        register,
        logout,
        completeOnboarding,
        refreshMetabolicProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
