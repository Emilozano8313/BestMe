/**
 * BestMe — Onboarding Step 3: Goals
 * ====================================
 * Captures activity level and fitness goal.
 * Uses selectable card grid with icon + description.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { ProgressBar } from '@/components/ui/ProgressBar';

// ── Options Data ──────────────────────────────────────────────────

const ACTIVITY_LEVELS = [
  {
    value: 'sedentary',
    label: 'Sedentario',
    desc: 'Trabajo de oficina, poco ejercicio',
    icon: 'desktop-outline' as const,
  },
  {
    value: 'light',
    label: 'Ligero',
    desc: 'Ejercicio 1-3 veces/semana',
    icon: 'walk-outline' as const,
  },
  {
    value: 'moderate',
    label: 'Moderado',
    desc: 'Ejercicio 3-5 veces/semana',
    icon: 'bicycle-outline' as const,
  },
  {
    value: 'active',
    label: 'Activo',
    desc: 'Ejercicio 6-7 veces/semana',
    icon: 'fitness-outline' as const,
  },
  {
    value: 'very_active',
    label: 'Muy Activo',
    desc: 'Atleta o trabajo físico intenso',
    icon: 'flame-outline' as const,
  },
];

const FITNESS_GOALS = [
  {
    value: 'lose_weight',
    label: 'Perder Grasa',
    desc: 'Déficit calórico con alta proteína',
    icon: 'trending-down-outline' as const,
    color: palette.coral,
  },
  {
    value: 'maintain',
    label: 'Mantener',
    desc: 'Preservar composición corporal',
    icon: 'swap-horizontal-outline' as const,
    color: palette.cyan,
  },
  {
    value: 'gain_muscle',
    label: 'Ganar Músculo',
    desc: 'Superávit calórico controlado',
    icon: 'trending-up-outline' as const,
    color: palette.emerald,
  },
];

export default function StepGoals() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    date_of_birth: string;
    gender: string;
    height_cm: string;
    weight_kg: string;
    body_fat_percentage: string;
  }>();

  const [activityLevel, setActivityLevel] = useState('');
  const [goal, setGoal] = useState('');

  const isValid = activityLevel !== '' && goal !== '';

  const handleContinue = () => {
    router.push({
      pathname: '/(onboarding)/step-results',
      params: {
        ...params,
        activity_level: activityLevel,
        goal,
      },
    });
  };

  const handleBack = () => router.back();

  return (
    <LinearGradient
      colors={[palette.dark900, palette.dark800]}
      style={styles.gradient}
    >
      <ProgressBar currentStep={3} totalSteps={4} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="trophy-outline" size={44} color={palette.amber} />
          </View>
          <Text style={styles.title}>Tus Objetivos</Text>
          <Text style={styles.subtitle}>
            Personalizamos tu plan de nutrición según tu estilo de vida y meta.
          </Text>
        </View>

        {/* ── Activity Level ───────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Nivel de Actividad</Text>
          {ACTIVITY_LEVELS.map((option) => {
            const isActive = activityLevel === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.optionCard, isActive && styles.optionCardActive]}
                onPress={() => setActivityLevel(option.value)}
              >
                <View
                  style={[
                    styles.optionIcon,
                    isActive && styles.optionIconActive,
                  ]}
                >
                  <Ionicons
                    name={option.icon}
                    size={22}
                    color={isActive ? palette.emerald : palette.gray400}
                  />
                </View>
                <View style={styles.optionText}>
                  <Text
                    style={[
                      styles.optionLabel,
                      isActive && styles.optionLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text style={styles.optionDesc}>{option.desc}</Text>
                </View>
                {isActive && (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={palette.emerald}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* ── Fitness Goal ──────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Objetivo Fitness</Text>
          <View style={styles.goalGrid}>
            {FITNESS_GOALS.map((option) => {
              const isActive = goal === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.goalCard, isActive && { borderColor: option.color }]}
                  onPress={() => setGoal(option.value)}
                >
                  {isActive ? (
                    <LinearGradient
                      colors={[
                        `${option.color}22`,
                        `${option.color}08`,
                      ]}
                      style={styles.goalCardInner}
                    >
                      <Ionicons name={option.icon} size={32} color={option.color} />
                      <Text style={[styles.goalLabel, { color: option.color }]}>
                        {option.label}
                      </Text>
                      <Text style={styles.goalDesc}>{option.desc}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.goalCardInner}>
                      <Ionicons name={option.icon} size={32} color={palette.gray400} />
                      <Text style={styles.goalLabel}>{option.label}</Text>
                      <Text style={styles.goalDesc}>{option.desc}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Buttons ────────────────────────────────── */}
        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
            onPress={handleBack}
          >
            <Ionicons name="arrow-back" size={20} color={palette.gray300} />
            <Text style={styles.backButtonText}>Atrás</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              !isValid && styles.buttonDisabled,
            ]}
            onPress={handleContinue}
            disabled={!isValid}
          >
            <LinearGradient
              colors={isValid ? [palette.emerald, palette.cyan] : [palette.dark500, palette.dark400]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonGradient}
            >
              <Text style={[styles.buttonText, !isValid && styles.buttonTextDisabled]}>
                Calcular
              </Text>
              <Ionicons
                name="sparkles"
                size={20}
                color={isValid ? palette.white : palette.gray400}
              />
            </LinearGradient>
          </Pressable>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },

  // Header
  header: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 179, 64, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
  },
  title: {
    color: palette.white,
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.bold,
    textAlign: 'center',
  },
  subtitle: {
    color: palette.gray300,
    fontSize: Typography.size.md,
    textAlign: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    lineHeight: 22,
  },

  // Sections
  section: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    color: palette.gray200,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },

  // Activity Options (list)
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  optionCardActive: {
    borderColor: palette.emerald,
    backgroundColor: 'rgba(0, 214, 143, 0.06)',
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconActive: {
    backgroundColor: 'rgba(0, 214, 143, 0.12)',
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    color: palette.gray200,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.medium,
  },
  optionLabelActive: {
    color: palette.white,
    fontWeight: Typography.weight.bold,
  },
  optionDesc: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: 2,
  },

  // Goal Cards (grid)
  goalGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  goalCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  goalCardInner: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
  },
  goalLabel: {
    color: palette.gray200,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    textAlign: 'center',
  },
  goalDesc: {
    color: palette.gray400,
    fontSize: 9,
    textAlign: 'center',
    lineHeight: 13,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.base,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  backButtonText: {
    color: palette.gray300,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.medium,
  },
  button: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.6 },
  buttonGradient: {
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  buttonText: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
  buttonTextDisabled: {
    color: palette.gray400,
  },
});
