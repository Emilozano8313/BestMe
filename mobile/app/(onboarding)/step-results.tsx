/**
 * BestMe — Onboarding Step 4: Results
 * ======================================
 * Sends the onboarding data to the API, displays the computed
 * metabolic profile (BMR, TDEE, macros), and completes onboarding.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { GlassCard } from '@/components/ui/GlassCard';
import { useAuth } from '@/context/AuthContext';

// ── Label Maps ────────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Perder Grasa',
  maintain: 'Mantener',
  gain_muscle: 'Ganar Músculo',
};

const EQUATION_LABELS: Record<string, string> = {
  mifflin_st_jeor: 'Mifflin-St Jeor',
  katch_mcardle: 'Katch-McArdle',
};

export default function StepResults() {
  const params = useLocalSearchParams<{
    date_of_birth: string;
    gender: string;
    height_cm: string;
    weight_kg: string;
    body_fat_percentage: string;
    activity_level: string;
    goal: string;
  }>();

  const { completeOnboarding, metabolicProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    submitOnboarding();
  }, []);

  const submitOnboarding = async () => {
    try {
      setIsLoading(true);
      setError('');

      await completeOnboarding({
        date_of_birth: params.date_of_birth!,
        gender: params.gender!,
        height_cm: parseFloat(params.height_cm!),
        weight_kg: parseFloat(params.weight_kg!),
        body_fat_percentage: params.body_fat_percentage
          ? parseFloat(params.body_fat_percentage)
          : null,
        activity_level: params.activity_level!,
        goal: params.goal!,
      });
    } catch (err: any) {
      setError(err.message || 'Error al calcular tu perfil metabólico');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Loading State ─────────────────────────────────────────────

  if (isLoading) {
    return (
      <LinearGradient colors={[palette.dark900, palette.dark800]} style={styles.centered}>
        <ProgressBar currentStep={4} totalSteps={4} />
        <View style={styles.loadingContainer}>
          <View style={styles.loadingCircle}>
            <ActivityIndicator size="large" color={palette.emerald} />
          </View>
          <Text style={styles.loadingTitle}>Calculando tu perfil...</Text>
          <Text style={styles.loadingSubtitle}>
            Analizando tus datos con nuestro motor metabólico
          </Text>
        </View>
      </LinearGradient>
    );
  }

  // ── Error State ───────────────────────────────────────────────

  if (error) {
    return (
      <LinearGradient colors={[palette.dark900, palette.dark800]} style={styles.centered}>
        <ProgressBar currentStep={4} totalSteps={4} />
        <View style={styles.loadingContainer}>
          <Ionicons name="warning-outline" size={64} color={palette.coral} />
          <Text style={styles.errorTitle}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.8 }]}
            onPress={submitOnboarding}
          >
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  // ── Success State ─────────────────────────────────────────────

  const profile = metabolicProfile!;

  return (
    <LinearGradient colors={[palette.dark900, palette.dark800]} style={{ flex: 1 }}>
      <ProgressBar currentStep={4} totalSteps={4} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={56} color={palette.emerald} />
          </View>
          <Text style={styles.title}>¡Tu Plan Está Listo!</Text>
          <Text style={styles.subtitle}>
            Hemos calculado tu perfil metabólico personalizado.
          </Text>
        </View>

        {/* ── Equation Badge ─────────────────────────── */}
        <View style={styles.equationBadge}>
          <Ionicons name="flask-outline" size={14} color={palette.cyan} />
          <Text style={styles.equationText}>
            Ecuación: {EQUATION_LABELS[profile.equation_used] || profile.equation_used}
          </Text>
          {profile.lean_mass_kg && (
            <Text style={styles.equationDetail}>
              · Masa magra: {profile.lean_mass_kg} kg
            </Text>
          )}
        </View>

        {/* ── BMR & TDEE Card ────────────────────────── */}
        <GlassCard style={styles.card} variant="highlight">
          <View style={styles.metricRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>TMB</Text>
              <Text style={styles.metricValue}>
                {Math.round(profile.bmr)}
              </Text>
              <Text style={styles.metricUnit}>kcal/día</Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>TDEE</Text>
              <Text style={styles.metricValue}>
                {Math.round(profile.tdee)}
              </Text>
              <Text style={styles.metricUnit}>kcal/día</Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Objetivo</Text>
              <Text style={[styles.metricValue, { color: palette.emerald }]}>
                {Math.round(profile.calorie_target)}
              </Text>
              <Text style={styles.metricUnit}>kcal/día</Text>
            </View>
          </View>
        </GlassCard>

        {/* ── Goal Badge ─────────────────────────────── */}
        <View style={styles.goalRow}>
          <Ionicons name="flag-outline" size={16} color={palette.amber} />
          <Text style={styles.goalText}>
            Meta: {GOAL_LABELS[profile.goal] || profile.goal}
          </Text>
        </View>

        {/* ── Macros Card ────────────────────────────── */}
        <GlassCard style={styles.card}>
          <Text style={styles.cardTitle}>Tu Reparto de Macros</Text>

          {/* Protein */}
          <View style={styles.macroRow}>
            <View style={[styles.macroDot, { backgroundColor: palette.protein }]} />
            <Text style={styles.macroLabel}>Proteína</Text>
            <Text style={styles.macroGrams}>{Math.round(profile.macros.protein_g)}g</Text>
            <Text style={styles.macroKcal}>{Math.round(profile.macros.protein_kcal)} kcal</Text>
          </View>

          <View style={styles.macroDivider} />

          {/* Carbs */}
          <View style={styles.macroRow}>
            <View style={[styles.macroDot, { backgroundColor: palette.carbs }]} />
            <Text style={styles.macroLabel}>Carbohidratos</Text>
            <Text style={styles.macroGrams}>{Math.round(profile.macros.carbs_g)}g</Text>
            <Text style={styles.macroKcal}>{Math.round(profile.macros.carbs_kcal)} kcal</Text>
          </View>

          <View style={styles.macroDivider} />

          {/* Fat */}
          <View style={styles.macroRow}>
            <View style={[styles.macroDot, { backgroundColor: palette.fat }]} />
            <Text style={styles.macroLabel}>Grasas</Text>
            <Text style={styles.macroGrams}>{Math.round(profile.macros.fat_g)}g</Text>
            <Text style={styles.macroKcal}>{Math.round(profile.macros.fat_kcal)} kcal</Text>
          </View>
        </GlassCard>

        {/* ── Info Tip ───────────────────────────────── */}
        <View style={styles.infoCard}>
          <Ionicons name="bulb-outline" size={18} color={palette.amber} />
          <Text style={styles.infoText}>
            Estos valores se recalculan automáticamente cuando actualices tu peso o porcentaje de grasa corporal.
          </Text>
        </View>

        {/* ── CTA Button ─────────────────────────────── */}
        <Pressable
          style={({ pressed }) => [styles.ctaButton, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={[palette.emerald, palette.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaText}>Comenzar Mi Viaje</Text>
            <Ionicons name="rocket-outline" size={22} color={palette.white} />
          </LinearGradient>
        </Pressable>

        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  loadingCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 214, 143, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  loadingTitle: {
    color: palette.white,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    marginBottom: Spacing.sm,
  },
  loadingSubtitle: {
    color: palette.gray300,
    fontSize: Typography.size.md,
    textAlign: 'center',
  },

  // Error
  errorTitle: {
    color: palette.coral,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  retryButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  retryText: {
    color: palette.coral,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
  },

  // Header
  header: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  successIcon: {
    marginBottom: Spacing.md,
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
  },

  // Equation Badge
  equationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 201, 219, 0.10)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  equationText: {
    color: palette.cyan,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
  },
  equationDetail: {
    color: palette.gray300,
    fontSize: Typography.size.xs,
  },

  // Cards
  card: {
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    marginBottom: Spacing.base,
  },

  // Metric Row
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    color: palette.gray300,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  metricValue: {
    color: palette.white,
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.extrabold,
  },
  metricUnit: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },

  // Goal Row
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  goalText: {
    color: palette.amber,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },

  // Macros
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.md,
  },
  macroLabel: {
    color: palette.gray200,
    fontSize: Typography.size.md,
    flex: 1,
  },
  macroGrams: {
    color: palette.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    marginRight: Spacing.md,
    minWidth: 50,
    textAlign: 'right',
  },
  macroKcal: {
    color: palette.gray400,
    fontSize: Typography.size.sm,
    minWidth: 70,
    textAlign: 'right',
  },
  macroDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },

  // Info
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255, 179, 64, 0.08)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  infoText: {
    flex: 1,
    color: palette.gray300,
    fontSize: Typography.size.sm,
    lineHeight: 20,
  },

  // CTA
  ctaButton: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  ctaGradient: {
    paddingVertical: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  ctaText: {
    color: palette.white,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.extrabold,
  },
});
