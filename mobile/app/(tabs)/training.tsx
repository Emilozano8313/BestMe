/**
 * BestMe — Training Screen
 * ===========================
 * Workout overview with exercise cards, AI trainer CTA,
 * and recent session history.
 */

import React from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Pressable,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { GlassCard } from '@/components/ui/GlassCard';

// ── Mock Data ────────────────────────────────────────────────────
const EXERCISES = [
  {
    id: '1',
    name: 'Sentadillas',
    englishName: 'Squats',
    icon: 'body-outline' as const,
    color: palette.emerald,
    muscles: 'Cuádriceps · Glúteos',
    available: true,
  },
  {
    id: '2',
    name: 'Flexiones',
    englishName: 'Push-ups',
    icon: 'fitness-outline' as const,
    color: palette.coral,
    muscles: 'Pecho · Tríceps',
    available: true,
  },
  {
    id: '3',
    name: 'Peso Muerto',
    englishName: 'Deadlift',
    icon: 'barbell-outline' as const,
    color: palette.amber,
    muscles: 'Espalda · Isquiotibiales',
    available: true,
  },
  {
    id: '4',
    name: 'Press Militar',
    englishName: 'Overhead Press',
    icon: 'arrow-up-outline' as const,
    color: palette.violet,
    muscles: 'Hombros · Tríceps',
    available: true,
  },
];

const RECENT_SESSIONS = [
  {
    id: '1',
    exercise: 'Sentadillas',
    date: 'Ayer',
    sets: 4,
    reps: 48,
    formScore: 87,
    duration: '18 min',
  },
  {
    id: '2',
    exercise: 'Flexiones',
    date: 'Hace 2 días',
    sets: 3,
    reps: 36,
    formScore: 92,
    duration: '12 min',
  },
];

export default function TrainingScreen() {
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
          <Text style={styles.title}>Entrenamiento</Text>
          <Text style={styles.subtitle}>Entrenador Biomecánico con IA</Text>
        </View>

        {/* ── AI Trainer CTA ─────────────────────────── */}
        <Pressable style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
          <LinearGradient
            colors={[palette.emerald, palette.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.8 }}
            style={styles.ctaGradient}
          >
            <View style={styles.ctaContent}>
              <View style={styles.ctaLeft}>
                <View style={styles.ctaBadge}>
                  <Ionicons name="sparkles" size={12} color={palette.white} />
                  <Text style={styles.ctaBadgeText}>IA EN VIVO</Text>
                </View>
                <Text style={styles.ctaTitle}>Iniciar Sesión con IA</Text>
                <Text style={styles.ctaDesc}>
                  La cámara analizará tu técnica en tiempo real y contará tus repeticiones
                </Text>
              </View>
              <View style={styles.ctaIconBox}>
                <Ionicons name="videocam" size={32} color="rgba(255,255,255,0.9)" />
              </View>
            </View>
          </LinearGradient>
        </Pressable>

        {/* ── Exercises Grid ──────────────────────────── */}
        <Text style={styles.sectionTitle}>Ejercicios Disponibles</Text>
        <View style={styles.exerciseGrid}>
          {EXERCISES.map((exercise) => (
            <Pressable
              key={exercise.id}
              style={({ pressed }) => [
                styles.exerciseCardWrapper,
                pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
              ]}
            >
              <GlassCard style={styles.exerciseCard}>
                <LinearGradient
                  colors={[`${exercise.color}18`, `${exercise.color}06`]}
                  style={styles.exerciseIconBox}
                >
                  <Ionicons name={exercise.icon} size={26} color={exercise.color} />
                </LinearGradient>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                <Text style={styles.exerciseEnglish}>{exercise.englishName}</Text>
                <Text style={styles.exerciseMuscles}>{exercise.muscles}</Text>
              </GlassCard>
            </Pressable>
          ))}
        </View>

        {/* ── Recent Sessions ─────────────────────────── */}
        <Text style={styles.sectionTitle}>Sesiones Recientes</Text>
        {RECENT_SESSIONS.map((session) => (
          <GlassCard key={session.id} style={styles.sessionCard}>
            <View style={styles.sessionHeader}>
              <View>
                <Text style={styles.sessionExercise}>{session.exercise}</Text>
                <Text style={styles.sessionDate}>{session.date} · {session.duration}</Text>
              </View>
              <View style={styles.formScoreBadge}>
                <Ionicons name="shield-checkmark" size={14} color={
                  session.formScore >= 90 ? palette.emerald :
                  session.formScore >= 70 ? palette.amber : palette.coral
                } />
                <Text style={[styles.formScoreText, {
                  color: session.formScore >= 90 ? palette.emerald :
                         session.formScore >= 70 ? palette.amber : palette.coral,
                }]}>
                  {session.formScore}%
                </Text>
              </View>
            </View>

            <View style={styles.sessionStats}>
              <View style={styles.sessionStat}>
                <Text style={styles.statValue}>{session.sets}</Text>
                <Text style={styles.statLabel}>Series</Text>
              </View>
              <View style={styles.sessionStatDivider} />
              <View style={styles.sessionStat}>
                <Text style={styles.statValue}>{session.reps}</Text>
                <Text style={styles.statLabel}>Reps Totales</Text>
              </View>
              <View style={styles.sessionStatDivider} />
              <View style={styles.sessionStat}>
                <Text style={styles.statValue}>{session.formScore}%</Text>
                <Text style={styles.statLabel}>Form Score</Text>
              </View>
            </View>
          </GlassCard>
        ))}

        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.dark900 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing['2xl'] },

  header: { marginBottom: Spacing.xl },
  title: {
    color: palette.white,
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.bold,
  },
  subtitle: {
    color: palette.gray300,
    fontSize: Typography.size.md,
    marginTop: 4,
  },

  // CTA
  ctaGradient: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaLeft: { flex: 1 },
  ctaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    gap: 4,
    marginBottom: Spacing.sm,
  },
  ctaBadgeText: {
    color: palette.white,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1,
  },
  ctaTitle: {
    color: palette.white,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    marginBottom: 4,
  },
  ctaDesc: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: Typography.size.sm,
    lineHeight: 18,
  },
  ctaIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
  },

  sectionTitle: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    marginBottom: Spacing.base,
  },

  // Exercise Grid
  exerciseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  exerciseCardWrapper: {
    width: '47%',
  },
  exerciseCard: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  exerciseIconBox: {
    width: 54,
    height: 54,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  exerciseName: {
    color: palette.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  exerciseEnglish: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: 2,
  },
  exerciseMuscles: {
    color: palette.gray300,
    fontSize: Typography.size.xs,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },

  // Sessions
  sessionCard: { marginBottom: Spacing.md },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  sessionExercise: {
    color: palette.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  sessionDate: {
    color: palette.gray400,
    fontSize: Typography.size.sm,
    marginTop: 2,
  },
  formScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 214, 143, 0.08)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  formScoreText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  sessionStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  sessionStat: { alignItems: 'center', flex: 1 },
  sessionStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  statValue: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
  statLabel: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: 2,
  },
});
