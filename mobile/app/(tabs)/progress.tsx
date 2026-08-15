/**
 * BestMe — Progress
 * ===================
 * Trends over time plus the meal history.
 *
 * The dashboard answers "how am I doing today"; this screen answers "am I
 * actually moving". That needs a time axis, which is what was missing:
 * `GET /meals/history` existed but nothing consumed it.
 *
 * Layout follows the dataviz method: one range filter above everything it
 * scopes, stat tiles for the headline numbers (a number is not a chart),
 * then the charts.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Pressable,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { GlassCard } from '@/components/ui/GlassCard';
import { LineChart } from '@/components/charts/LineChart';
import { CalorieBars } from '@/components/charts/CalorieBars';
import { MacroStack } from '@/components/charts/MacroStack';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

interface DailyPoint {
  date: string;
  calories_consumed: number;
  calories_burned: number;
  calorie_target: number | null;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  weight_kg: number | null;
  workout_minutes: number;
  meal_count: number;
}

interface HistorySummary {
  days_with_data: number;
  avg_calories_consumed: number | null;
  avg_calories_burned: number | null;
  days_on_target: number;
  latest_weight_kg: number | null;
  weight_change_kg: number | null;
  total_workout_minutes: number;
}

interface HistoryResponse {
  days: number;
  points: DailyPoint[];
  summary: HistorySummary;
}

const RANGES = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '3 meses' },
] as const;

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  dinner: 'Cena',
  snack: 'Snack',
};

function formatFullDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function ProgressScreen() {
  const { refreshMetabolicProfile } = useAuth();

  const [range, setRange] = useState<number>(30);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [weightDraft, setWeightDraft] = useState('');
  const [isSavingWeight, setIsSavingWeight] = useState(false);

  const load = useCallback(
    async (days: number) => {
      const res = await api.get<HistoryResponse>(`/metrics/history?days=${days}`);
      if (res.data) setHistory(res.data);
      setLoadError(res.error);
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await load(range);
        if (active) setIsLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [load, range]),
  );

  const handleRangeChange = useCallback(
    async (days: number) => {
      setRange(days);
      // Hold the previous render rather than flashing a skeleton.
      await load(days);
    },
    [load],
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load(range);
    setIsRefreshing(false);
  }, [load, range]);

  const handleLogWeight = useCallback(async () => {
    const parsed = parseFloat(weightDraft.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 20 || parsed >= 400) {
      Alert.alert('Peso no válido', 'Introduce un peso entre 20 y 400 kg.');
      return;
    }
    setIsSavingWeight(true);
    try {
      const res = await api.post('/metrics/weight', { weight_kg: parsed });
      if (res.error) throw new Error(res.error);
      setWeightDraft('');
      await load(range);
      await refreshMetabolicProfile();
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'No se pudo guardar el peso.');
    } finally {
      setIsSavingWeight(false);
    }
  }, [weightDraft, load, range, refreshMetabolicProfile]);

  // ── Derived series ──────────────────────────────────────────────

  const weightSeries = useMemo(
    () => (history?.points ?? []).map((p) => ({ date: p.date, value: p.weight_kg })),
    [history],
  );

  const calorieSeries = useMemo(
    () =>
      (history?.points ?? []).map((p) => ({
        date: p.date,
        consumed: p.calories_consumed,
        target: p.calorie_target,
      })),
    [history],
  );

  /**
   * Daily *averages*, not window totals.
   *
   * Totals are meaningless to compare against a daily target — "4587 g of
   * protein" next to a 182 g goal tells the reader nothing, and grows with
   * the range they picked. An average sits on the same scale as the target.
   */
  const macroAverages = useMemo(() => {
    const logged = (history?.points ?? []).filter((p) => p.calories_consumed > 0);
    if (logged.length === 0) return { protein_g: 0, carbs_g: 0, fat_g: 0 };
    const sum = logged.reduce(
      (acc, p) => ({
        protein_g: acc.protein_g + p.protein_g,
        carbs_g: acc.carbs_g + p.carbs_g,
        fat_g: acc.fat_g + p.fat_g,
      }),
      { protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
    return {
      protein_g: sum.protein_g / logged.length,
      carbs_g: sum.carbs_g / logged.length,
      fat_g: sum.fat_g / logged.length,
    };
  }, [history]);

  const macroTargets = useMemo(() => {
    const latest = (history?.points ?? []).filter((p) => p.target_protein_g !== null).at(-1);
    if (!latest) return null;
    return {
      protein_g: latest.target_protein_g ?? 0,
      carbs_g: latest.target_carbs_g ?? 0,
      fat_g: latest.target_fat_g ?? 0,
    };
  }, [history]);

  const historyDays = useMemo(
    () =>
      (history?.points ?? [])
        .filter((p) => p.meal_count > 0 || p.workout_minutes > 0 || p.weight_kg !== null)
        .slice()
        .reverse(),
    [history],
  );

  if (isLoading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={palette.emerald} />
      </View>
    );
  }

  const summary = history?.summary;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.dark900} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={palette.emerald}
            colors={[palette.emerald]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Progreso</Text>
          <Text style={styles.subtitle}>Tu evolución a lo largo del tiempo.</Text>
        </View>

        {loadError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color={palette.coral} />
            <Text style={styles.errorBannerText}>{loadError}</Text>
          </View>
        ) : null}

        {/* One filter row, above everything it scopes. */}
        <View style={styles.rangeRow}>
          {RANGES.map((option) => {
            const active = range === option.days;
            return (
              <Pressable
                key={option.days}
                onPress={() => handleRangeChange(option.days)}
                style={[styles.rangeChip, active && styles.rangeChipActive]}
              >
                <Text style={[styles.rangeText, active && styles.rangeTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Stat tiles — headline numbers are not charts. */}
        <View style={styles.tileRow}>
          <GlassCard style={styles.tile}>
            <Text style={styles.tileLabel}>Peso actual</Text>
            <Text style={styles.tileValue}>
              {summary?.latest_weight_kg != null ? summary.latest_weight_kg.toFixed(1) : '—'}
              {summary?.latest_weight_kg != null ? <Text style={styles.tileUnit}> kg</Text> : null}
            </Text>
            {summary?.weight_change_kg != null ? (
              <Text
                style={[
                  styles.tileDelta,
                  { color: summary.weight_change_kg <= 0 ? palette.emerald : palette.amber },
                ]}
              >
                {summary.weight_change_kg > 0 ? '+' : ''}
                {summary.weight_change_kg.toFixed(1)} kg
              </Text>
            ) : (
              <Text style={styles.tileDeltaMuted}>sin comparación</Text>
            )}
          </GlassCard>

          <GlassCard style={styles.tile}>
            <Text style={styles.tileLabel}>Media diaria</Text>
            <Text style={styles.tileValue}>
              {summary?.avg_calories_consumed != null
                ? Math.round(summary.avg_calories_consumed)
                : '—'}
              <Text style={styles.tileUnit}> kcal</Text>
            </Text>
            <Text style={styles.tileDeltaMuted}>
              {summary?.days_with_data ?? 0} días con registro
            </Text>
          </GlassCard>
        </View>

        <View style={styles.tileRow}>
          <GlassCard style={styles.tile}>
            <Text style={styles.tileLabel}>Días en objetivo</Text>
            <Text style={styles.tileValue}>{summary?.days_on_target ?? 0}</Text>
            <Text style={styles.tileDeltaMuted}>±10% del objetivo</Text>
          </GlassCard>

          <GlassCard style={styles.tile}>
            <Text style={styles.tileLabel}>Entrenamiento</Text>
            <Text style={styles.tileValue}>
              {Math.round(summary?.total_workout_minutes ?? 0)}
              <Text style={styles.tileUnit}> min</Text>
            </Text>
            <Text style={styles.tileDeltaMuted}>en el periodo</Text>
          </GlassCard>
        </View>

        {/* Weight check-in — the column existed but nothing wrote to it, so
            the metabolic engine never adapted to real progress. */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>Registrar peso de hoy</Text>
          <View style={styles.weightRow}>
            <TextInput
              style={styles.weightInput}
              value={weightDraft}
              onChangeText={setWeightDraft}
              keyboardType="decimal-pad"
              placeholder="kg"
              placeholderTextColor={palette.gray500}
            />
            <Pressable style={styles.weightBtn} onPress={handleLogWeight} disabled={isSavingWeight}>
              {isSavingWeight ? (
                <ActivityIndicator size="small" color={palette.dark900} />
              ) : (
                <Text style={styles.weightBtnText}>Guardar</Text>
              )}
            </Pressable>
          </View>
          <Text style={styles.sectionHint}>
            Tu peso alimenta el cálculo del metabolismo: registrarlo es lo que mantiene tu
            objetivo calórico ajustado a la realidad.
          </Text>
        </GlassCard>

        {/* Weight trend */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>Evolución del peso</Text>
          <LineChart points={weightSeries} unit="kg" precision={1} />
        </GlassCard>

        {/* Calories vs target */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>Calorías frente a tu objetivo</Text>
          <CalorieBars days={calorieSeries} />
        </GlassCard>

        {/* Macro split */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>Reparto de macronutrientes</Text>
          <Text style={styles.sectionSubtitle}>Media de tus días con registro</Text>
          <MacroStack totals={macroAverages} targets={macroTargets} />
        </GlassCard>

        {/* History list — the table-view twin of the charts above. */}
        <Text style={styles.sectionTitleOuter}>Historial</Text>
        {historyDays.length === 0 ? (
          <Text style={styles.emptyState}>
            Todavía no hay días registrados en este periodo.
          </Text>
        ) : (
          historyDays.map((day) => (
            <GlassCard key={day.date} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{formatFullDay(day.date)}</Text>
                {day.calorie_target ? (
                  <Text style={styles.dayTarget}>
                    objetivo {Math.round(day.calorie_target)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.dayStats}>
                <View style={styles.dayStat}>
                  <Text style={styles.dayStatValue}>{Math.round(day.calories_consumed)}</Text>
                  <Text style={styles.dayStatLabel}>kcal</Text>
                </View>
                <View style={styles.dayStatDivider} />
                <View style={styles.dayStat}>
                  <Text style={styles.dayStatValue}>{day.meal_count}</Text>
                  <Text style={styles.dayStatLabel}>comidas</Text>
                </View>
                <View style={styles.dayStatDivider} />
                <View style={styles.dayStat}>
                  <Text style={styles.dayStatValue}>{Math.round(day.calories_burned)}</Text>
                  <Text style={styles.dayStatLabel}>quemadas</Text>
                </View>
                <View style={styles.dayStatDivider} />
                <View style={styles.dayStat}>
                  <Text style={styles.dayStatValue}>
                    {day.weight_kg != null ? day.weight_kg.toFixed(1) : '—'}
                  </Text>
                  <Text style={styles.dayStatLabel}>kg</Text>
                </View>
              </View>

              <View style={styles.dayMacros}>
                <Text style={styles.dayMacroText}>
                  P {Math.round(day.protein_g)}g · C {Math.round(day.carbs_g)}g · G{' '}
                  {Math.round(day.fat_g)}g
                </Text>
              </View>
            </GlassCard>
          ))
        )}

        <View style={{ height: Spacing['4xl'] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.dark900 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing['2xl'] },

  header: { marginBottom: Spacing.lg },
  title: {
    color: palette.white,
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.bold,
  },
  subtitle: { color: palette.gray300, fontSize: Typography.size.md, marginTop: 4 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255, 107, 107, 0.10)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.base,
  },
  errorBannerText: { color: palette.coral, fontSize: Typography.size.sm, flex: 1 },

  rangeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  rangeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  rangeChipActive: { backgroundColor: palette.emerald },
  rangeText: { color: palette.gray300, fontSize: Typography.size.sm },
  rangeTextActive: { color: palette.dark900, fontWeight: Typography.weight.bold },

  tileRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  tile: { flex: 1, paddingVertical: Spacing.base },
  tileLabel: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tileValue: {
    color: palette.white,
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
    marginTop: 4,
  },
  tileUnit: {
    color: palette.gray300,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.regular,
  },
  tileDelta: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, marginTop: 2 },
  tileDeltaMuted: { color: palette.gray400, fontSize: Typography.size.xs, marginTop: 2 },

  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    marginBottom: Spacing.base,
  },
  sectionTitleOuter: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    marginBottom: Spacing.base,
  },
  sectionSubtitle: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.base,
  },
  sectionHint: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    lineHeight: 17,
    marginTop: Spacing.sm,
  },

  weightRow: { flexDirection: 'row', gap: Spacing.sm },
  weightInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.sm,
    color: palette.white,
    fontSize: Typography.size.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  weightBtn: {
    backgroundColor: palette.emerald,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    minWidth: 96,
    alignItems: 'center',
  },
  weightBtnText: {
    color: palette.dark900,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },

  emptyState: {
    color: palette.gray400,
    fontSize: Typography.size.sm,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },

  dayCard: { marginBottom: Spacing.sm, paddingVertical: Spacing.base },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  dayLabel: {
    color: palette.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    textTransform: 'capitalize',
  },
  dayTarget: { color: palette.gray400, fontSize: Typography.size.xs },
  dayStats: { flexDirection: 'row', alignItems: 'center' },
  dayStat: { flex: 1, alignItems: 'center' },
  dayStatValue: {
    color: palette.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  dayStatLabel: { color: palette.gray400, fontSize: Typography.size.xs, marginTop: 1 },
  dayStatDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.06)' },
  dayMacros: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  dayMacroText: { color: palette.gray300, fontSize: Typography.size.xs, textAlign: 'center' },
});
