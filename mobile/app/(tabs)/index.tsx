/**
 * BestMe — Home Screen (Dashboard)
 * ==================================
 * Main dashboard showing daily progress, calorie ring, macro bars,
 * and quick actions. Fetches real metabolic data from the API.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { GlassCard } from '@/components/ui/GlassCard';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { MacroBar } from '@/components/ui/MacroBar';
import { QuickAction } from '@/components/ui/QuickAction';
import { useAuth } from '@/context/AuthContext';

// ── Goal Label Map ───────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Perder Grasa',
  maintain: 'Mantener',
  gain_muscle: 'Ganar Músculo',
};

const GOAL_ICONS: Record<string, string> = {
  lose_weight: 'trending-down',
  maintain: 'swap-horizontal',
  gain_muscle: 'trending-up',
};

export default function HomeScreen() {
  const { user, metabolicProfile, refreshMetabolicProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(!metabolicProfile);
  const [meals, setMeals] = useState<any[]>([]);
  const [dailySummary, setDailySummary] = useState({
    calories_consumed: 0,
    calories_burned: 0,
    workout_minutes: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      await refreshMetabolicProfile();
      // Fetch today's meals to calculate consumed macros
      const mealsRes = await fetch('http://localhost:8000/api/meals/today', {
        headers: { Authorization: `Bearer ${api.token}` }
      });
      if (mealsRes.ok) {
        setMeals(await mealsRes.json());
      }

      // Fetch today's summary (calories burned, minutes)
      const summaryRes = await fetch('http://localhost:8000/api/metrics/today_summary', {
        headers: { Authorization: `Bearer ${api.token}` }
      });
      if (summaryRes.ok) {
        setDailySummary(await summaryRes.json());
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Loading State ─────────────────────────────────────────────

  if (isLoading || !metabolicProfile) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <StatusBar barStyle="light-content" backgroundColor={palette.dark900} />
        <View style={styles.skeletonContainer}>
          <ActivityIndicator size="large" color={palette.emerald} />
          <Text style={styles.skeletonText}>Cargando tu perfil...</Text>
        </View>
      </View>
    );
  }

  // ── Computed Values ───────────────────────────────────────────

  const profile = metabolicProfile;
  const userName = user?.full_name?.split(' ')[0] || 'Usuario';
  const goalLabel = GOAL_LABELS[profile.goal] || profile.goal;
  const goalIcon = GOAL_ICONS[profile.goal] || 'flag';

  const caloriesConsumed = meals.reduce((sum, m) => sum + m.total_calories, 0);
  const proteinConsumed = meals.reduce((sum, m) => sum + m.total_protein_g, 0);
  const carbsConsumed = meals.reduce((sum, m) => sum + m.total_carbs_g, 0);
  const fatConsumed = meals.reduce((sum, m) => sum + m.total_fat_g, 0);

  const caloriesTarget = Math.round(profile.calorie_target);
  const caloriesRemaining = Math.max(0, caloriesTarget - caloriesConsumed);
  const caloriesProgress = caloriesTarget > 0 ? caloriesConsumed / caloriesTarget : 0;

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.dark900} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting},</Text>
            <Text style={styles.userName}>{userName} 👋</Text>
          </View>
          <View style={styles.streakBadge}>
            <Ionicons name="flame" size={16} color={palette.amber} />
            <Text style={styles.streakText}>0</Text>
          </View>
        </View>

        {/* ── Calorie Ring Card ───────────────────────── */}
        <GlassCard style={styles.calorieCard} variant="highlight">
          <View style={styles.calorieRow}>
            <ProgressRing
              progress={caloriesProgress}
              size={130}
              strokeWidth={10}
              color={palette.emerald}
              value={caloriesRemaining.toString()}
              label="Restantes"
              subtitle="kcal"
            />
            <View style={styles.calorieDetails}>
              <View style={styles.calorieDetailRow}>
                <View style={[styles.calorieDot, { backgroundColor: palette.emerald }]} />
                <Text style={styles.calorieLabel}>Consumidas</Text>
                <Text style={styles.calorieValue}>{caloriesConsumed}</Text>
              </View>
              <View style={styles.calorieDivider} />
              <View style={styles.calorieDetailRow}>
                <View style={[styles.calorieDot, { backgroundColor: palette.violet }]} />
                <Text style={styles.calorieLabel}>Objetivo</Text>
                <Text style={styles.calorieValue}>{caloriesTarget}</Text>
              </View>
              <View style={styles.calorieDivider} />
              <View style={styles.calorieDetailRow}>
                <View style={[styles.calorieDot, { backgroundColor: palette.cyan }]} />
                <Text style={styles.calorieLabel}>TDEE</Text>
                <Text style={styles.calorieValue}>{Math.round(profile.tdee)}</Text>
              </View>
              <View style={styles.goalBadge}>
                <Ionicons name={goalIcon as any} size={12} color={palette.emerald} />
                <Text style={styles.goalText}>{goalLabel}</Text>
              </View>
            </View>
          </View>
        </GlassCard>

        {/* ── Macros Card ─────────────────────────────── */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>Macronutrientes</Text>
          <MacroBar
            label="Proteína"
            current={Math.round(proteinConsumed)}
            target={Math.round(profile.macros.protein_g)}
            color={palette.protein}
          />
          <MacroBar
            label="Carbohidratos"
            current={Math.round(carbsConsumed)}
            target={Math.round(profile.macros.carbs_g)}
            color={palette.carbs}
          />
          <MacroBar
            label="Grasas"
            current={Math.round(fatConsumed)}
            target={Math.round(profile.macros.fat_g)}
            color={palette.fat}
          />
        </GlassCard>

        {/* ── Quick Actions ───────────────────────────── */}
        <Text style={styles.sectionTitleOutside}>Acciones Rápidas</Text>
        <View style={styles.quickActions}>
          <QuickAction
            icon="camera-outline"
            label="Escanear Comida"
            gradient={[palette.emerald, palette.cyan]}
          />
          <QuickAction
            icon="barbell-outline"
            label="Entrenar"
            gradient={[palette.violet, palette.violetLight]}
          />
          <QuickAction
            icon="body-outline"
            label="Body Scan"
            gradient={[palette.coral, palette.amber]}
          />
          <QuickAction
            icon="analytics-outline"
            label="Métricas"
            gradient={[palette.cyan, palette.cyanLight]}
          />
        </View>

        {/* ── Today's Activity Card ──────────────────── */}
        <GlassCard style={styles.section}>
          <View style={styles.activityHeader}>
            <Text style={styles.sectionTitle}>Actividad de Hoy</Text>
            <View style={[styles.statusDot, { backgroundColor: palette.gray400 }]} />
          </View>

          <View style={styles.activityGrid}>
            <View style={styles.activityItem}>
              <LinearGradient
                colors={['rgba(0, 214, 143, 0.12)', 'rgba(0, 214, 143, 0.04)']}
                style={styles.activityIcon}
              >
                <Ionicons name="restaurant-outline" size={20} color={palette.emerald} />
              </LinearGradient>
              <Text style={styles.activityValue}>{meals.length}</Text>
              <Text style={styles.activityLabel}>Comidas</Text>
            </View>

            <View style={styles.activityDividerV} />

            <View style={styles.activityItem}>
              <LinearGradient
                colors={['rgba(139, 92, 246, 0.12)', 'rgba(139, 92, 246, 0.04)']}
                style={styles.activityIcon}
              >
                <Ionicons name="time-outline" size={20} color={palette.violet} />
              </LinearGradient>
              <Text style={styles.activityValue}>{Math.round(dailySummary.workout_minutes)}</Text>
              <Text style={styles.activityLabel}>Minutos</Text>
            </View>

            <View style={styles.activityDividerV} />

            <View style={styles.activityItem}>
              <LinearGradient
                colors={['rgba(255, 107, 107, 0.12)', 'rgba(255, 107, 107, 0.04)']}
                style={styles.activityIcon}
              >
                <Ionicons name="flame-outline" size={20} color={palette.coral} />
              </LinearGradient>
              <Text style={styles.activityValue}>{Math.round(dailySummary.calories_burned)}</Text>
              <Text style={styles.activityLabel}>Quemadas</Text>
            </View>
          </View>
        </GlassCard>

        {/* ── BMR Info Mini Card ──────────────────────── */}
        <GlassCard style={styles.section} variant="dark">
          <View style={styles.bmrRow}>
            <Ionicons name="flash-outline" size={18} color={palette.amber} />
            <Text style={styles.bmrLabel}>Tu Metabolismo Basal</Text>
            <Text style={styles.bmrValue}>{Math.round(profile.bmr)} kcal</Text>
          </View>
          <Text style={styles.bmrHint}>
            Calorías que tu cuerpo quema en reposo absoluto.
          </Text>
        </GlassCard>

        {/* Bottom padding */}
        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.dark900,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['2xl'],
  },

  // Skeleton loading
  skeletonContainer: {
    alignItems: 'center',
    gap: Spacing.lg,
  },
  skeletonText: {
    color: palette.gray300,
    fontSize: Typography.size.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  greeting: {
    color: palette.gray300,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.regular,
  },
  userName: {
    color: palette.white,
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.bold,
    marginTop: 2,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 179, 64, 0.12)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  streakText: {
    color: palette.amber,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
  },

  // Calorie Card
  calorieCard: {
    marginBottom: Spacing.lg,
  },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xl,
  },
  calorieDetails: {
    flex: 1,
  },
  calorieDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  calorieDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing.sm,
  },
  calorieLabel: {
    color: palette.gray300,
    fontSize: Typography.size.sm,
    flex: 1,
  },
  calorieValue: {
    color: palette.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
  },
  calorieDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: Spacing.sm,
  },
  goalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
    backgroundColor: 'rgba(0, 214, 143, 0.08)',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  goalText: {
    color: palette.emerald,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
  },

  // Sections
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    marginBottom: Spacing.base,
  },
  sectionTitleOutside: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    marginBottom: Spacing.base,
  },

  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },

  // Activity
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: Spacing.base,
  },
  activityGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  activityItem: {
    alignItems: 'center',
    flex: 1,
  },
  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  activityValue: {
    color: palette.white,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
  },
  activityLabel: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: 2,
  },
  activityDividerV: {
    width: 1,
    height: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },

  // BMR Info
  bmrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bmrLabel: {
    color: palette.gray200,
    fontSize: Typography.size.md,
    flex: 1,
  },
  bmrValue: {
    color: palette.amber,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
  bmrHint: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: Spacing.xs,
  },
});
