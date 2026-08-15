/**
 * BestMe — Onboarding Layout
 * ============================
 * Stack navigator for the onboarding flow.
 * Headerless for a full-screen premium experience.
 */

import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="step-basics" />
      <Stack.Screen name="step-body" />
      <Stack.Screen name="step-goals" />
      <Stack.Screen name="step-results" />
    </Stack>
  );
}
