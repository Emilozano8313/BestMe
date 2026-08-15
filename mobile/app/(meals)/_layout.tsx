/**
 * BestMe — Meals Layout
 * =======================
 * Stack navigator for meal tracking flow (Validation, etc.)
 */

import { Stack } from 'expo-router';

export default function MealsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_bottom' }}>
      <Stack.Screen name="validation" />
    </Stack>
  );
}
