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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { GlassCard } from '@/components/ui/GlassCard';
import { RouteTracker } from '@/components/RouteTracker';
import { getPoseDetectionStatus } from '@/utils/poseDetector';
import { EXERCISE_INSTRUCTIONS } from '@/constants/exerciseInstructions';
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

interface WarmupStep {
  name: string;
  duration_seconds: number;
}

interface WorkoutPlan {
  location: PlanLocation;
  goal: string;
  focus: string | null;
  warmup_minutes: number;
  warmup_exercises: WarmupStep[];
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

// Chip options for "day split" mode — null = the usual balanced circuit.
const FOCUS_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: 'Balanceado' },
  { value: 'legs', label: 'Piernas' },
  { value: 'push', label: 'Empuje' },
  { value: 'pull', label: 'Tirón' },
  { value: 'shoulders', label: 'Hombros' },
  { value: 'core', label: 'Core' },
  { value: 'full_body', label: 'Cuerpo completo' },
];

// A generous default for the cardio finisher countdown — the note itself
// says "15-20 minutos"; a Saltar button covers anyone who wants to cut it
// short or run long and just tap through.
const CARDIO_FINISHER_SECONDS = 15 * 60;

interface SessionStep {
  kind: 'warmup' | 'exercise' | 'cardio';
  name: string;
  /** Auto-counts down and advances when it hits 0. null = manual (exercise sets/reps pace varies per person). */
  targetSeconds: number | null;
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TrainScreen() {
  const insets = useSafeAreaInsets();
  const poseStatus = useMemo(() => getPoseDetectionStatus(), []);

  const [exercise, setExercise] = useState<string>('squat');
  const [sets, setSets] = useState<SetEntry[]>([{ reps: '', weight: '' }]);
  const [durationMin, setDurationMin] = useState('20');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<WorkoutSaved | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);

  const [planLocation, setPlanLocation] = useState<PlanLocation>('home');
  const [planFocus, setPlanFocus] = useState<string | null>(null);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [infoExercise, setInfoExercise] = useState<string | null>(null);

  // ── Session runner: walks through today's plan with a live timer ────
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepCountdown, setStepCountdown] = useState<number | null>(null);
  const [isFinishingSession, setIsFinishingSession] = useState(false);

  const sessionSteps: SessionStep[] = useMemo(() => {
    if (!plan) return [];
    const steps: SessionStep[] = plan.warmup_exercises.map((w) => ({
      kind: 'warmup' as const,
      name: w.name,
      targetSeconds: w.duration_seconds,
    }));
    plan.exercises.forEach((ex) =>
      steps.push({ kind: 'exercise' as const, name: ex.name, targetSeconds: null }),
    );
    if (plan.includes_cardio_finisher) {
      steps.push({
        kind: 'cardio' as const,
        name: 'Cardio final',
        targetSeconds: CARDIO_FINISHER_SECONDS,
      });
    }
    return steps;
  }, [plan]);

  const loadPlan = useCallback(async (location: PlanLocation, focus: string | null) => {
    setIsLoadingPlan(true);
    const query = focus ? `location=${location}&focus=${focus}` : `location=${location}`;
    const res = await api.get<WorkoutPlan>(`/workouts/plan?${query}`);
    if (res.data) setPlan(res.data);
    setPlanError(res.error);
    setIsLoadingPlan(false);
  }, []);

  // Free and instant (no AI call), so re-fetching on every focus and every
  // location/focus change costs nothing and keeps the plan current with
  // the user's latest profile. Skipped mid-session: swapping the plan out
  // from under a running timer would desync its step indices.
  useFocusEffect(
    useCallback(() => {
      if (sessionActive) return;
      void loadPlan(planLocation, planFocus);
    }, [loadPlan, planLocation, planFocus, sessionActive]),
  );

  // Overall stopwatch + the current step's countdown, both tick once a second.
  useEffect(() => {
    if (!sessionActive) return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
      setStepCountdown((c) => (c !== null && c > 0 ? c - 1 : c));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionActive]);

  const buildCompletedExercises = useCallback(
    (uptoStepIndex: number): PlannedExercise[] => {
      if (!plan) return [];
      const doneNames = new Set(
        sessionSteps
          .slice(0, uptoStepIndex)
          .filter((s) => s.kind === 'exercise')
          .map((s) => s.name),
      );
      return plan.exercises.filter((ex) => doneNames.has(ex.name));
    },
    [plan, sessionSteps],
  );

  const finishSession = useCallback(
    async (completedStepCount: number) => {
      if (sessionStartedAt === null) return;
      const duration = Math.max(1, Math.round((Date.now() - sessionStartedAt) / 1000));
      const completed = buildCompletedExercises(completedStepCount);

      setIsFinishingSession(true);
      try {
        const res = await api.post<WorkoutSaved>(
          '/workouts/',
          {
            exercise_name: 'circuito',
            total_reps: completed.length,
            duration_seconds: duration,
            started_at: new Date(sessionStartedAt).toISOString(),
            sets: completed.map((ex, index) => {
              const isTimed = ex.reps_label.trim().endsWith('s');
              return {
                set_number: index + 1,
                reps: isTimed ? 1 : parseInt(ex.reps_label, 10) || 1,
                weight_kg: 0,
                // No camera in this flow, so there's no measured technique
                // score — reporting a fabricated one would poison the history.
                form_score: 1.0,
                issues: [],
              };
            }),
            analysis_summary: {
              source: 'rutina_de_hoy',
              focus: plan?.focus ?? 'balanceado',
              location: plan?.location ?? null,
            },
          },
          'Rutina de hoy',
        );

        if (res.queued) {
          setQueuedMessage('Rutina guardada sin conexión — se sincronizará y sumará tus calorías apenas vuelva el internet.');
          return;
        }
        if (res.error || !res.data) {
          throw new Error(res.error ?? 'No se pudo guardar la rutina');
        }
        setLastSaved(res.data);
      } catch (error: any) {
        Alert.alert('Error', error?.message ?? 'No se pudo guardar la rutina.');
      } finally {
        setIsFinishingSession(false);
        setSessionActive(false);
        setSessionStartedAt(null);
        setCurrentStepIndex(0);
        setStepCountdown(null);
      }
    },
    [sessionStartedAt, buildCompletedExercises, plan],
  );

  const startSession = useCallback(() => {
    if (sessionSteps.length === 0) return;
    setLastSaved(null);
    setQueuedMessage(null);
    setCurrentStepIndex(0);
    setStepCountdown(sessionSteps[0].targetSeconds);
    setElapsedSeconds(0);
    setSessionStartedAt(Date.now());
    setSessionActive(true);
  }, [sessionSteps]);

  const advanceStep = useCallback(() => {
    const next = currentStepIndex + 1;
    if (next >= sessionSteps.length) {
      void finishSession(next);
      return;
    }
    setCurrentStepIndex(next);
    setStepCountdown(sessionSteps[next].targetSeconds);
  }, [currentStepIndex, sessionSteps, finishSession]);

  // A timed step (warmup/cardio) auto-advances when its countdown hits 0.
  useEffect(() => {
    if (sessionActive && stepCountdown === 0) {
      advanceStep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepCountdown]);

  const handleFinishEarly = useCallback(() => {
    Alert.alert(
      'Terminar rutina',
      '¿Seguro que quieres terminar antes de completar todos los pasos? Se guarda lo que llevas hecho.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Terminar',
          style: 'destructive',
          onPress: () => void finishSession(currentStepIndex),
        },
      ],
    );
  }, [currentStepIndex, finishSession]);

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
      const res = await api.post<WorkoutSaved>(
        '/workouts/',
        {
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
        },
        'Sesión de entrenamiento',
      );

      if (res.queued) {
        setQueuedMessage('Sesión guardada sin conexión — se sincronizará apenas vuelva el internet.');
        setSets([{ reps: '', weight: '' }]);
        return;
      }
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
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.lg }]}
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

            <View style={[styles.locationRow, sessionActive && styles.chipRowDisabled]}>
              {(['home', 'gym'] as const).map((loc) => {
                const active = planLocation === loc;
                return (
                  <Pressable
                    key={loc}
                    onPress={() => !sessionActive && setPlanLocation(loc)}
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

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.focusRow, sessionActive && styles.chipRowDisabled]}
            >
              {FOCUS_OPTIONS.map((option) => {
                const active = planFocus === option.value;
                return (
                  <Pressable
                    key={option.label}
                    onPress={() => !sessionActive && setPlanFocus(option.value)}
                    style={[styles.focusChip, active && styles.focusChipActive]}
                  >
                    <Text style={[styles.focusChipText, active && styles.focusChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

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

                {sessionActive && sessionSteps[currentStepIndex] ? (
                  <View style={styles.sessionBar}>
                    <View style={styles.sessionTimerRow}>
                      <Ionicons name="stopwatch-outline" size={18} color={palette.emerald} />
                      <Text style={styles.sessionTimerText}>{formatClock(elapsedSeconds)}</Text>
                      <Text style={styles.sessionStepCount}>
                        Paso {currentStepIndex + 1} de {sessionSteps.length}
                      </Text>
                    </View>

                    <Pressable
                      style={styles.sessionCurrentNameRow}
                      onPress={() => setInfoExercise(sessionSteps[currentStepIndex].name)}
                    >
                      <Text style={styles.sessionCurrentName}>
                        {sessionSteps[currentStepIndex].name}
                      </Text>
                      <Ionicons name="information-circle-outline" size={16} color={palette.gray300} />
                    </Pressable>

                    {sessionSteps[currentStepIndex].targetSeconds !== null ? (
                      <Text style={styles.sessionCountdown}>
                        Quedan {formatClock(stepCountdown ?? 0)}
                      </Text>
                    ) : null}

                    <View style={styles.sessionActionsRow}>
                      <Pressable
                        style={styles.sessionPrimaryBtn}
                        onPress={advanceStep}
                        disabled={isFinishingSession}
                      >
                        <Text style={styles.sessionPrimaryBtnText}>
                          {sessionSteps[currentStepIndex].targetSeconds !== null
                            ? 'Saltar →'
                            : 'Hecho, siguiente →'}
                        </Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={handleFinishEarly}
                      disabled={isFinishingSession}
                      style={styles.sessionStopBtn}
                    >
                      {isFinishingSession ? (
                        <ActivityIndicator size="small" color={palette.gray400} />
                      ) : (
                        <Text style={styles.sessionStopBtnText}>Terminar rutina</Text>
                      )}
                    </Pressable>
                  </View>
                ) : plan.exercises.length > 0 ? (
                  <Pressable style={styles.startSessionBtn} onPress={startSession}>
                    <Ionicons name="play-circle" size={20} color={palette.dark900} />
                    <Text style={styles.startSessionBtnText}>Comenzar rutina</Text>
                  </Pressable>
                ) : null}

                {plan.warmup_exercises.length > 0 ? (
                  <View style={styles.warmupBox}>
                    <View style={styles.warmupHeader}>
                      <Ionicons name="body-outline" size={14} color={palette.cyan} />
                      <Text style={styles.warmupTitle}>
                        Calentamiento ({plan.warmup_minutes} min)
                      </Text>
                    </View>
                    <Text style={styles.warmupSubtitle}>
                      Nunca te saltes esto: reduce el riesgo de lesión antes del trabajo fuerte.
                    </Text>
                    {plan.warmup_exercises.map((step, index) => {
                      const done = sessionActive && index < currentStepIndex;
                      return (
                        <Pressable
                          key={`${step.name}-${index}`}
                          style={styles.warmupRow}
                          onPress={() => setInfoExercise(step.name)}
                        >
                          <View style={styles.warmupStepNameRow}>
                            <Ionicons
                              name={done ? 'checkmark-circle' : 'information-circle-outline'}
                              size={13}
                              color={done ? palette.emerald : palette.gray400}
                            />
                            <Text style={[styles.warmupStepName, done && styles.stepNameDone]}>
                              {step.name}
                            </Text>
                          </View>
                          <Text style={styles.warmupStepDuration}>{step.duration_seconds}s</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {plan.exercises.map((ex, index) => {
                  const absoluteIndex = plan.warmup_exercises.length + index;
                  const done = sessionActive && absoluteIndex < currentStepIndex;
                  const current = sessionActive && absoluteIndex === currentStepIndex;
                  return (
                    <Pressable
                      key={`${ex.name}-${index}`}
                      style={[styles.planExerciseRow, current && styles.planExerciseRowCurrent]}
                      onPress={() => setInfoExercise(ex.name)}
                    >
                      <View style={styles.planExerciseIndex}>
                        {done ? (
                          <Ionicons name="checkmark" size={13} color={palette.emerald} />
                        ) : (
                          <Text style={styles.planExerciseIndexText}>{index + 1}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.planExerciseNameRow}>
                          <Text style={[styles.planExerciseName, done && styles.stepNameDone]}>
                            {ex.name}
                          </Text>
                          <Ionicons name="information-circle-outline" size={14} color={palette.gray400} />
                        </View>
                        <Text style={styles.planExerciseMeta}>
                          {MUSCLE_GROUP_LABELS[ex.muscle_group] ?? ex.muscle_group} · {ex.sets} series
                          {' × '}
                          {ex.reps_label}
                        </Text>
                      </View>
                      <Text style={styles.planExerciseRest}>{ex.rest_seconds}s desc.</Text>
                    </Pressable>
                  );
                })}

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

          {/* GPS distance + time tracking for caminar/correr/ciclismo */}
          <RouteTracker />

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
          ) : queuedMessage ? (
            <GlassCard style={styles.savedCard}>
              <View style={styles.noticeRow}>
                <Ionicons name="cloud-offline-outline" size={20} color={palette.amber} />
                <Text style={styles.savedTitle}>Guardado sin conexión</Text>
              </View>
              <Text style={styles.noticeText}>{queuedMessage}</Text>
            </GlassCard>
          ) : null}

          <View style={{ height: Spacing['4xl'] }} />
        </ScrollView>
      </LinearGradient>

      {/* How-to for whatever exercise/warm-up step was tapped. */}
      <Modal
        visible={infoExercise !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoExercise(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setInfoExercise(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{infoExercise}</Text>
              <Pressable onPress={() => setInfoExercise(null)} hitSlop={10}>
                <Ionicons name="close" size={24} color={palette.gray300} />
              </Pressable>
            </View>

            {infoExercise && EXERCISE_INSTRUCTIONS[infoExercise] ? (
              <ScrollView style={styles.modalBody}>
                {EXERCISE_INSTRUCTIONS[infoExercise].aka?.length ? (
                  <Text style={styles.modalAka}>
                    También conocido como: {EXERCISE_INSTRUCTIONS[infoExercise].aka!.join(', ')}
                  </Text>
                ) : null}
                {EXERCISE_INSTRUCTIONS[infoExercise].steps.map((step, index) => (
                  <View key={index} style={styles.modalStepRow}>
                    <View style={styles.modalStepIndex}>
                      <Text style={styles.modalStepIndexText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.modalStepText}>{step}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.modalAka}>
                Todavía no tengo instrucciones guardadas para este ejercicio.
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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

  focusRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.base },
  focusChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  focusChipActive: { backgroundColor: palette.violet },
  focusChipText: { color: palette.gray400, fontSize: Typography.size.xs },
  focusChipTextActive: { color: palette.white, fontWeight: Typography.weight.bold },

  planErrorText: {
    color: palette.coral,
    fontSize: Typography.size.sm,
    paddingVertical: Spacing.sm,
  },
  planMetaRow: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.base },
  planMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  planMetaText: { color: palette.gray300, fontSize: Typography.size.xs },

  chipRowDisabled: { opacity: 0.4 },

  startSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: palette.emerald,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  startSessionBtnText: {
    color: palette.dark900,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
  },

  sessionBar: {
    backgroundColor: 'rgba(0, 214, 143, 0.08)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 214, 143, 0.25)',
    padding: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  sessionTimerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sessionTimerText: {
    color: palette.white,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  sessionStepCount: { color: palette.gray400, fontSize: Typography.size.xs },
  sessionCurrentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
  },
  sessionCurrentName: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
  sessionCountdown: {
    color: palette.cyan,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  sessionActionsRow: { marginTop: Spacing.md, width: '100%' },
  sessionPrimaryBtn: {
    backgroundColor: palette.emerald,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  sessionPrimaryBtnText: {
    color: palette.dark900,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  sessionStopBtn: { marginTop: Spacing.sm, paddingVertical: 4 },
  sessionStopBtnText: { color: palette.gray400, fontSize: Typography.size.xs },

  planExerciseRowCurrent: {
    backgroundColor: 'rgba(0, 214, 143, 0.06)',
    borderRadius: BorderRadius.sm,
  },
  stepNameDone: { color: palette.gray500, textDecorationLine: 'line-through' },

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
  planExerciseNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  planExerciseName: {
    color: palette.white,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },
  planExerciseMeta: { color: palette.gray400, fontSize: Typography.size.xs, marginTop: 1 },
  planExerciseRest: { color: palette.gray500, fontSize: Typography.size.xs },

  warmupBox: {
    backgroundColor: 'rgba(59, 205, 255, 0.06)',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  warmupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warmupTitle: {
    color: palette.cyan,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  warmupSubtitle: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    lineHeight: 16,
    marginTop: 2,
    marginBottom: Spacing.xs,
  },
  warmupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  warmupStepNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  warmupStepName: { color: palette.gray200, fontSize: Typography.size.xs },
  warmupStepDuration: { color: palette.gray400, fontSize: Typography.size.xs },

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

  // Exercise how-to modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: palette.dark800,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    color: palette.white,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    flex: 1,
    marginRight: Spacing.md,
  },
  modalBody: {},
  modalAka: {
    color: palette.gray400,
    fontSize: Typography.size.sm,
    fontStyle: 'italic',
    marginBottom: Spacing.md,
  },
  modalStepRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  modalStepIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalStepIndexText: {
    color: palette.dark900,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
  },
  modalStepText: {
    color: palette.gray200,
    fontSize: Typography.size.sm,
    lineHeight: 20,
    flex: 1,
  },
});
