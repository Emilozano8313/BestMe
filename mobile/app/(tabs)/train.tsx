/**
 * BestMe — Trainer
 * ==================
 * Logs a workout and computes the calories burned server-side (MET).
 *
 * Two modes:
 *
 *   Camera analysis — counts reps and checks technique on-device via
 *     MoveNet. Needs react-native-vision-camera + react-native-fast-tflite,
 *     which only load in a Development Build (see ENTRENADOR.md).
 *
 *   Manual logging — always available. You enter reps and weight yourself.
 *
 * The previous version *simulated* the camera: it fed `generateMockSquatFrame()`
 * into the engine and saved the resulting fake reps to the database as if
 * they were real. Recording invented workout data is worse than recording
 * none, so that path is gone.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { GlassCard } from '@/components/ui/GlassCard';
import { getPoseDetectionStatus } from '@/utils/poseDetector';
import api from '@/services/api';

// MET values the backend recognises; anything else falls back to 4.0.
const EXERCISES = [
  { value: 'squat', label: 'Sentadillas', icon: 'body-outline', muscles: 'Cuádriceps · Glúteos' },
  { value: 'pushup', label: 'Flexiones', icon: 'fitness-outline', muscles: 'Pecho · Tríceps' },
  { value: 'deadlift', label: 'Peso Muerto', icon: 'barbell-outline', muscles: 'Espalda · Isquios' },
  { value: 'bench_press', label: 'Press Banca', icon: 'arrow-up-outline', muscles: 'Pecho · Hombros' },
] as const;

interface SetEntry {
  reps: string;
  weight: string;
}

interface WorkoutSaved {
  calories_burned: number;
  total_reps: number;
  total_sets: number;
}

// ── Workout plan (GET /workouts/plan) — rule-based, no AI, no cost ────

type PlanLocation = 'home' | 'gym';

interface PlannedExercise {
  name: string;
  muscle_group: string;
  sets: number;
  reps_label: string;
  rest_seconds: number;
  is_compound: boolean;
}

interface WorkoutPlan {
  location: PlanLocation;
  goal: string;
  warmup_minutes: number;
  exercises: PlannedExercise[];
  includes_cardio_finisher: boolean;
  cardio_finisher_note: string | null;
  estimated_duration_minutes: number;
  estimated_calories_burned: number | null;
  coach_note: string;
}

const MUSCLE_GROUP_LABELS: Record<string, string> = {
  legs: 'Piernas',
  push: 'Empuje',
  pull: 'Tirón',
  shoulders: 'Hombros',
  core: 'Core',
  full_body: 'Cuerpo completo',
};

export default function TrainScreen() {
  const poseStatus = useMemo(() => getPoseDetectionStatus(), []);

  const [exercise, setExercise] = useState<string>('squat');
  const [sets, setSets] = useState<SetEntry[]>([{ reps: '', weight: '' }]);
  const [durationMin, setDurationMin] = useState('20');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<WorkoutSaved | null>(null);

  const [planLocation, setPlanLocation] = useState<PlanLocation>('home');
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);

  const loadPlan = useCallback(async (location: PlanLocation) => {
    setIsLoadingPlan(true);
    const res = await api.get<WorkoutPlan>(`/workouts/plan?location=${location}`);
    if (res.data) setPlan(res.data);
    setPlanError(res.error);
    setIsLoadingPlan(false);
  }, []);

  // Free and instant (no AI call), so re-fetching on every focus and every
  // location change costs nothing and keeps the plan current with the
  // user's latest profile.
  useFocusEffect(
    useCallback(() => {
      void loadPlan(planLocation);
    }, [loadPlan, planLocation]),
  );

  const addSet = useCallback(() => {
    setSets((current) => [...current, { reps: '', weight: current.at(-1)?.weight ?? '' }]);
  }, []);

  const removeSet = useCallback((index: number) => {
    setSets((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  }, []);

  const updateSet = useCallback((index: number, field: keyof SetEntry, value: string) => {
    setSets((current) =>
      current.map((set, i) => (i === index ? { ...set, [field]: value } : set)),
    );
  }, []);

  const totalReps = sets.reduce((sum, set) => sum + (parseInt(set.reps, 10) || 0), 0);

  const handleSave = useCallback(async () => {
    const duration = parseFloat(durationMin.replace(',', '.'));
    if (!Number.isFinite(duration) || duration <= 0) {
      Alert.alert('Duración no válida', 'Introduce cuántos minutos duró la sesión.');
      return;
    }
    if (totalReps <= 0) {
      Alert.alert('Sin repeticiones', 'Añade al menos una serie con repeticiones.');
      return;
    }

    const startedAt = new Date(Date.now() - duration * 60_000).toISOString();

    setIsSaving(true);
    try {
      const res = await api.post<WorkoutSaved>('/workouts/', {
        exercise_name: exercise,
        total_reps: totalReps,
        duration_seconds: Math.round(duration * 60),
        started_at: startedAt,
        sets: sets
          .filter((set) => (parseInt(set.reps, 10) || 0) > 0)
          .map((set, index) => ({
            set_number: index + 1,
            reps: parseInt(set.reps, 10) || 0,
            weight_kg: parseFloat(set.weight.replace(',', '.')) || 0,
            // Recorded manually, so there is no measured technique score.
            // Reporting a fabricated one would poison the history.
            form_score: 1.0,
            issues: [],
          })),
        analysis_summary: { source: 'manual' },
      });

      if (res.error || !res.data) {
        throw new Error(res.error ?? 'No se pudo guardar la sesión');
      }

      setLastSaved(res.data);
      setSets([{ reps: '', weight: '' }]);
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'No se pudo guardar la sesión.');
    } finally {
      setIsSaving(false);
    }
  }, [exercise, sets, durationMin, totalReps]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[palette.dark900, palette.dark800]} style={styles.gradient}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Entrenamiento</Text>
            <Text style={styles.subtitle}>Registra tu sesión y calcula lo que quemas.</Text>
          </View>

          {/* Rule-based workout recommendation — no Claude call, so it
              works with no API key and never costs anything. */}
          <GlassCard style={styles.planCard} variant="highlight">
            <View style={styles.planHeader}>
              <Text style={styles.sectionTitle}>Tu rutina de hoy</Text>
              <View style={styles.freeTag}>
                <Ionicons name="flash-outline" size={11} color={palette.emerald} />
                <Text style={styles.freeTagText}>Gratis</Text>
              </View>
            </View>

            <View style={styles.locationRow}>
              {(['home', 'gym'] as const).map((loc) => {
                const active = planLocation === loc;
                return (
                  <Pressable
                    key={loc}
                    onPress={() => setPlanLocation(loc)}
                    style={[styles.locationChip, active && styles.locationChipActive]}
                  >
                    <Ionicons
                      name={loc === 'home' ? 'home-outline' : 'barbell-outline'}
                      size={15}
                      color={active ? palette.dark900 : palette.gray300}
                    />
                    <Text style={[styles.locationChipText, active && styles.locationChipTextActive]}>
                      {loc === 'home' ? 'En casa' : 'En el gym'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {isLoadingPlan ? (
              <ActivityIndicator color={palette.emerald} style={{ marginVertical: Spacing.lg }} />
            ) : planError ? (
              <Text style={styles.planErrorText}>{planError}</Text>
            ) : plan ? (
              <>
                <View style={styles.planMetaRow}>
                  <View style={styles.planMetaItem}>
                    <Ionicons name="time-outline" size={13} color={palette.cyan} />
                    <Text style={styles.planMetaText}>
                      ~{plan.estimated_duration_minutes} min con calentamiento
                    </Text>
                  </View>
                  {plan.estimated_calories_burned != null ? (
                    <View style={styles.planMetaItem}>
                      <Ionicons name="flame-outline" size={13} color={palette.coral} />
                      <Text style={styles.planMetaText}>
                        ~{Math.round(plan.estimated_calories_burned)} kcal
                      </Text>
                    </View>
                  ) : null}
                </View>

                {plan.exercises.map((ex, index) => (
                  <View key={`${ex.name}-${index}`} style={styles.planExerciseRow}>
                    <View style={styles.planExerciseIndex}>
                      <Text style={styles.planExerciseIndexText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planExerciseName}>{ex.name}</Text>
                      <Text style={styles.planExerciseMeta}>
                        {MUSCLE_GROUP_LABELS[ex.muscle_group] ?? ex.muscle_group} · {ex.sets} series
                        {' × '}
                        {ex.reps_label}
                      </Text>
                    </View>
                    <Text style={styles.planExerciseRest}>{ex.rest_seconds}s desc.</Text>
                  </View>
                ))}

                {plan.includes_cardio_finisher && plan.cardio_finisher_note ? (
                  <View style={styles.finisherBox}>
                    <Ionicons name="pulse-outline" size={15} color={palette.amber} />
                    <Text style={styles.finisherText}>{plan.cardio_finisher_note}</Text>
                  </View>
                ) : null}

                <Text style={styles.coachNote}>{plan.coach_note}</Text>
              </>
            ) : null}
          </GlassCard>

          {/* Camera analysis availability */}
          {poseStatus.available ? (
            <Pressable>
              <LinearGradient
                colors={[palette.emerald, palette.cyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0.8 }}
                style={styles.ctaGradient}
              >
                <View style={styles.ctaRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ctaTitle}>Análisis con cámara</Text>
                    <Text style={styles.ctaDesc}>
                      Cuenta repeticiones y revisa tu técnica en tiempo real.
                    </Text>
                  </View>
                  <Ionicons name="videocam" size={30} color="rgba(255,255,255,0.9)" />
                </View>
              </LinearGradient>
            </Pressable>
          ) : (
            <GlassCard style={styles.noticeCard}>
              <View style={styles.noticeRow}>
                <Ionicons name="information-circle-outline" size={20} color={palette.amber} />
                <Text style={styles.noticeTitle}>Análisis con cámara no disponible</Text>
              </View>
              <Text style={styles.noticeText}>
                Contar repeticiones con la cámara necesita módulos nativos que Expo Go no
                puede cargar. Requiere un Development Build — los pasos están en{' '}
                <Text style={styles.noticeMono}>ENTRENADOR.md</Text>.
              </Text>
              <Text style={styles.noticeText}>
                Mientras tanto puedes registrar la sesión a mano: las calorías se calculan
                igual con la fórmula MET.
              </Text>
            </GlassCard>
          )}

          {/* Exercise picker */}
          <Text style={styles.sectionTitle}>Ejercicio</Text>
          <View style={styles.exerciseGrid}>
            {EXERCISES.map((item) => {
              const active = exercise === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => setExercise(item.value)}
                  style={[styles.exerciseCard, active && styles.exerciseCardActive]}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={24}
                    color={active ? palette.emerald : palette.gray400}
                  />
                  <Text style={[styles.exerciseName, active && { color: palette.white }]}>
                    {item.label}
                  </Text>
                  <Text style={styles.exerciseMuscles}>{item.muscles}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Sets */}
          <Text style={styles.sectionTitle}>Series</Text>
          <GlassCard style={styles.setsCard}>
            <View style={styles.setHeaderRow}>
              <Text style={[styles.setHeaderText, { width: 34 }]}>#</Text>
              <Text style={[styles.setHeaderText, { flex: 1 }]}>Reps</Text>
              <Text style={[styles.setHeaderText, { flex: 1 }]}>Peso (kg)</Text>
              <View style={{ width: 30 }} />
            </View>

            {sets.map((set, index) => (
              <View key={index} style={styles.setRow}>
                <Text style={styles.setNumber}>{index + 1}</Text>
                <TextInput
                  style={styles.setInput}
                  value={set.reps}
                  onChangeText={(value) => updateSet(index, 'reps', value)}
                  keyboardType="number-pad"
                  placeholder="12"
                  placeholderTextColor={palette.gray500}
                />
                <TextInput
                  style={styles.setInput}
                  value={set.weight}
                  onChangeText={(value) => updateSet(index, 'weight', value)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={palette.gray500}
                />
                <Pressable onPress={() => removeSet(index)} style={styles.removeBtn}>
                  <Ionicons
                    name="close-circle-outline"
                    size={20}
                    color={sets.length === 1 ? palette.gray500 : palette.coral}
                  />
                </Pressable>
              </View>
            ))}

            <Pressable onPress={addSet} style={styles.addSetBtn}>
              <Ionicons name="add-circle-outline" size={18} color={palette.emerald} />
              <Text style={styles.addSetText}>Añadir serie</Text>
            </Pressable>
          </GlassCard>

          {/* Duration */}
          <Text style={styles.sectionTitle}>Duración</Text>
          <GlassCard style={styles.durationCard}>
            <View style={styles.durationRow}>
              <Ionicons name="time-outline" size={20} color={palette.cyan} />
              <TextInput
                style={styles.durationInput}
                value={durationMin}
                onChangeText={setDurationMin}
                keyboardType="number-pad"
              />
              <Text style={styles.durationUnit}>minutos</Text>
            </View>
            <Text style={styles.durationHint}>
              Las calorías salen de la fórmula MET: intensidad del ejercicio × tu peso ×
              tiempo. La duración es lo que más pesa en el resultado.
            </Text>
          </GlassCard>

          {/* Summary + save */}
          <GlassCard style={styles.summaryCard} variant="highlight">
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{sets.length}</Text>
                <Text style={styles.summaryLabel}>Series</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{totalReps}</Text>
                <Text style={styles.summaryLabel}>Reps totales</Text>
              </View>
            </View>
          </GlassCard>

          <Pressable style={styles.saveBtn} onPress={handleSave} disabled={isSaving}>
            <LinearGradient
              colors={[palette.emerald, palette.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.saveGradient}
            >
              {isSaving ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={22} color={palette.white} />
                  <Text style={styles.saveText}>Guardar sesión</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>

          {lastSaved ? (
            <GlassCard style={styles.savedCard}>
              <View style={styles.noticeRow}>
                <Ionicons name="flame" size={20} color={palette.coral} />
                <Text style={styles.savedTitle}>
                  Quemaste {Math.round(lastSaved.calories_burned)} kcal
                </Text>
              </View>
              <Text style={styles.noticeText}>
                {lastSaved.total_sets} series · {lastSaved.total_reps} repeticiones.
                Ya está sumado a tu balance de hoy.
              </Text>
            </GlassCard>
          ) : null}

          <View style={{ height: Spacing['4xl'] }} />
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  gradient: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: 60 },

  header: { marginBottom: Spacing.xl },
  title: {
    color: palette.white,
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.bold,
  },
  subtitle: { color: palette.gray300, fontSize: Typography.size.md, marginTop: 4 },

  planCard: { marginBottom: Spacing.xl },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.base,
  },
  freeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 214, 143, 0.10)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  freeTagText: {
    color: palette.emerald,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
  },

  locationRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.base },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  locationChipActive: { backgroundColor: palette.emerald },
  locationChipText: { color: palette.gray300, fontSize: Typography.size.sm },
  locationChipTextActive: { color: palette.dark900, fontWeight: Typography.weight.bold },

  planErrorText: {
    color: palette.coral,
    fontSize: Typography.size.sm,
    paddingVertical: Spacing.sm,
  },
  planMetaRow: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.base },
  planMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  planMetaText: { color: palette.gray300, fontSize: Typography.size.xs },

  planExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  planExerciseIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planExerciseIndexText: {
    color: palette.gray300,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
  },
  planExerciseName: {
    color: palette.white,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },
  planExerciseMeta: { color: palette.gray400, fontSize: Typography.size.xs, marginTop: 1 },
  planExerciseRest: { color: palette.gray500, fontSize: Typography.size.xs },

  finisherBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255, 179, 64, 0.08)',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  finisherText: { color: palette.amber, fontSize: Typography.size.xs, flex: 1, lineHeight: 16 },

  coachNote: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    lineHeight: 17,
    marginTop: Spacing.sm,
  },

  ctaGradient: { borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.xl },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  ctaTitle: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
  ctaDesc: { color: 'rgba(255,255,255,0.8)', fontSize: Typography.size.sm, marginTop: 2 },

  noticeCard: { marginBottom: Spacing.xl, padding: Spacing.lg },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  noticeTitle: {
    color: palette.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    flex: 1,
  },
  noticeText: {
    color: palette.gray300,
    fontSize: Typography.size.sm,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  noticeMono: { color: palette.cyan, fontWeight: Typography.weight.bold },

  sectionTitle: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    marginBottom: Spacing.base,
  },

  exerciseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  exerciseCard: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  exerciseCardActive: {
    borderColor: palette.emerald,
    backgroundColor: 'rgba(0, 214, 143, 0.08)',
  },
  exerciseName: {
    color: palette.gray300,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    marginTop: Spacing.sm,
  },
  exerciseMuscles: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: 2,
    textAlign: 'center',
  },

  setsCard: { marginBottom: Spacing.xl, padding: Spacing.base },
  setHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  setHeaderText: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  setNumber: { color: palette.gray400, width: 34, fontSize: Typography.size.md },
  setInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.sm,
    color: palette.white,
    fontSize: Typography.size.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    textAlign: 'center',
  },
  removeBtn: { width: 30, alignItems: 'center' },
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  addSetText: { color: palette.emerald, fontSize: Typography.size.sm, fontWeight: Typography.weight.medium },

  durationCard: { marginBottom: Spacing.xl, padding: Spacing.base },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  durationInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.sm,
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    textAlign: 'center',
    minWidth: 80,
  },
  durationUnit: { color: palette.gray300, fontSize: Typography.size.md },
  durationHint: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    lineHeight: 17,
    marginTop: Spacing.sm,
  },

  summaryCard: { marginBottom: Spacing.lg },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryValue: {
    color: palette.white,
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
  },
  summaryLabel: { color: palette.gray400, fontSize: Typography.size.xs, marginTop: 2 },
  summaryDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.06)' },

  saveBtn: { borderRadius: BorderRadius.lg, overflow: 'hidden', marginBottom: Spacing.lg },
  saveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  saveText: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },

  savedCard: { padding: Spacing.lg },
  savedTitle: {
    color: palette.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    flex: 1,
  },
});
