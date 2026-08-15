/**
 * BestMe — Profile Screen
 * ==========================
 * Real user profile: body metrics, metabolic engine state, quick weight
 * update, and body-scan entry point.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Pressable,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { GlassCard } from '@/components/ui/GlassCard';
import { useAuth } from '@/context/AuthContext';

// ── Label maps ───────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Perder Grasa',
  maintain: 'Mantener',
  gain_muscle: 'Ganar Músculo',
};

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: 'Sedentario',
  light: 'Ligero',
  moderate: 'Moderado',
  active: 'Activo',
  very_active: 'Muy Activo',
};

const ACTIVITY_MULTIPLIERS: Record<string, string> = {
  sedentary: '1.2',
  light: '1.375',
  moderate: '1.55',
  active: '1.725',
  very_active: '1.9',
};

const EQUATION_LABELS: Record<string, string> = {
  mifflin_st_jeor: 'Mifflin-St Jeor',
  katch_mcardle: 'Katch-McArdle',
};

/** Age in completed years, matching the backend's calculation. */
function calculateAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

function formatMemberSince(createdAt: string | undefined): string {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

function initialsOf(fullName: string | undefined): string {
  if (!fullName) return '?';
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, metabolicProfile, logout, updateProfile } = useAuth();

  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [weightDraft, setWeightDraft] = useState('');
  const [isSavingWeight, setIsSavingWeight] = useState(false);

  const age = useMemo(() => calculateAge(user?.date_of_birth ?? null), [user?.date_of_birth]);
  const memberSince = useMemo(() => formatMemberSince(user?.created_at), [user?.created_at]);

  const hasBodyFat =
    user?.body_fat_percentage !== null && user?.body_fat_percentage !== undefined;

  const handleStartEditWeight = useCallback(() => {
    setWeightDraft(user?.weight_kg ? String(user.weight_kg) : '');
    setIsEditingWeight(true);
  }, [user?.weight_kg]);

  const handleSaveWeight = useCallback(async () => {
    const parsed = parseFloat(weightDraft.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 20 || parsed > 400) {
      Alert.alert('Peso no válido', 'Introduce un peso entre 20 y 400 kg.');
      return;
    }

    setIsSavingWeight(true);
    try {
      await updateProfile({ weight_kg: parsed });
      setIsEditingWeight(false);
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'No se pudo guardar el peso.');
    } finally {
      setIsSavingWeight(false);
    }
  }, [weightDraft, updateProfile]);

  const handleLogout = useCallback(() => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void logout() },
    ]);
  }, [logout]);

  if (!user) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={palette.emerald} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.dark900} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header / Avatar ────────────────────────── */}
        <View style={styles.profileHeader}>
          <LinearGradient
            colors={[palette.emerald, palette.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarGradient}
          >
            <Text style={styles.avatarText}>{initialsOf(user.full_name)}</Text>
          </LinearGradient>
          <Text style={styles.profileName}>{user.full_name}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
          {memberSince ? (
            <View style={styles.memberBadge}>
              <Ionicons name="star" size={12} color={palette.amber} />
              <Text style={styles.memberText}>Miembro desde {memberSince}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Body Metrics ────────────────────────────── */}
        <GlassCard variant="highlight" style={styles.section}>
          <Text style={styles.sectionTitle}>Datos Corporales</Text>
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{age ?? '—'}</Text>
              <Text style={styles.metricLabel}>Edad</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{user.height_cm ?? '—'}</Text>
              <Text style={styles.metricLabel}>Altura (cm)</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{user.weight_kg ?? '—'}</Text>
              <Text style={styles.metricLabel}>Peso (kg)</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={[styles.metricValue, !hasBodyFat && { color: palette.gray400 }]}>
                {hasBodyFat ? `${user.body_fat_percentage}%` : '—'}
              </Text>
              <Text style={styles.metricLabel}>Grasa Corp.</Text>
            </View>
          </View>

          {/* Inline weight update — weight drives the whole calorie target,
              so it needs to be changeable without a full edit screen. */}
          {isEditingWeight ? (
            <View style={styles.weightEditRow}>
              <TextInput
                style={styles.weightInput}
                value={weightDraft}
                onChangeText={setWeightDraft}
                keyboardType="decimal-pad"
                placeholder="kg"
                placeholderTextColor={palette.gray500}
                autoFocus
              />
              <Pressable
                style={styles.weightSaveBtn}
                onPress={handleSaveWeight}
                disabled={isSavingWeight}
              >
                {isSavingWeight ? (
                  <ActivityIndicator size="small" color={palette.dark900} />
                ) : (
                  <Text style={styles.weightSaveText}>Guardar</Text>
                )}
              </Pressable>
              <Pressable style={styles.weightCancelBtn} onPress={() => setIsEditingWeight(false)}>
                <Text style={styles.weightCancelText}>Cancelar</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.weightEditTrigger} onPress={handleStartEditWeight}>
              <Ionicons name="create-outline" size={16} color={palette.emerald} />
              <Text style={styles.weightEditTriggerText}>Actualizar mi peso</Text>
            </Pressable>
          )}
        </GlassCard>

        {/* ── Body Scan CTA ───────────────────────────── */}
        <Pressable
          style={({ pressed }) => [pressed && { opacity: 0.9 }]}
          onPress={() => router.push('/(tabs)/scanner')}
        >
          <LinearGradient
            colors={[palette.coral, palette.amber]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.8 }}
            style={styles.scanCta}
          >
            <View style={styles.scanCtaContent}>
              <View style={styles.scanCtaLeft}>
                <View style={styles.scanBadge}>
                  <Ionicons name="sparkles" size={11} color={palette.white} />
                  <Text style={styles.scanBadgeText}>BODY SCAN IA</Text>
                </View>
                <Text style={styles.scanCtaTitle}>Escanear Composición</Text>
                <Text style={styles.scanCtaDesc}>
                  {hasBodyFat
                    ? 'Actualiza tu % de grasa corporal con una nueva foto'
                    : 'Toma una foto frontal y la IA estimará tu grasa corporal'}
                </Text>
              </View>
              <View style={styles.scanIconBox}>
                <Ionicons name="scan-outline" size={30} color="rgba(255,255,255,0.9)" />
              </View>
            </View>
          </LinearGradient>
        </Pressable>

        {/* ── Metabolic Info ───────────────────────────── */}
        <GlassCard style={styles.section}>
          <View style={styles.metabolicHeader}>
            <Text style={styles.sectionTitle}>Motor Metabólico</Text>
            {metabolicProfile ? (
              <View style={styles.formulaBadge}>
                <Text style={styles.formulaText}>
                  {EQUATION_LABELS[metabolicProfile.equation_used] ??
                    metabolicProfile.equation_used}
                </Text>
              </View>
            ) : null}
          </View>

          {metabolicProfile ? (
            <>
              <View style={styles.metabolicRow}>
                <View style={styles.metabolicItem}>
                  <Text style={styles.metabolicLabel}>TMB</Text>
                  <Text style={[styles.metabolicValue, { color: palette.cyan }]}>
                    {Math.round(metabolicProfile.bmr)}
                  </Text>
                  <Text style={styles.metabolicUnit}>kcal/día</Text>
                </View>
                <View style={styles.metabolicArrow}>
                  <Ionicons name="arrow-forward" size={16} color={palette.gray400} />
                  <Text style={styles.metabolicMultiplier}>
                    × {ACTIVITY_MULTIPLIERS[metabolicProfile.activity_level] ?? '?'}
                  </Text>
                </View>
                <View style={styles.metabolicItem}>
                  <Text style={styles.metabolicLabel}>TDEE</Text>
                  <Text style={[styles.metabolicValue, { color: palette.emerald }]}>
                    {Math.round(metabolicProfile.tdee)}
                  </Text>
                  <Text style={styles.metabolicUnit}>kcal/día</Text>
                </View>
              </View>

              {metabolicProfile.lean_mass_kg ? (
                <View style={styles.leanMassRow}>
                  <Ionicons name="barbell-outline" size={14} color={palette.cyan} />
                  <Text style={styles.leanMassText}>
                    Masa magra: {metabolicProfile.lean_mass_kg} kg
                  </Text>
                </View>
              ) : null}

              <View style={styles.goalRow}>
                <Ionicons name="flag-outline" size={16} color={palette.emerald} />
                <Text style={styles.goalLabel}>Objetivo:</Text>
                <Text style={[styles.goalValue, { color: palette.emerald }]}>
                  {GOAL_LABELS[metabolicProfile.goal] ?? metabolicProfile.goal}
                </Text>
                <Text style={styles.goalTarget}>
                  {Math.round(metabolicProfile.calorie_target)} kcal
                </Text>
              </View>

              <View style={styles.goalRow}>
                <Ionicons name="walk-outline" size={16} color={palette.cyan} />
                <Text style={styles.goalLabel}>Actividad:</Text>
                <Text style={[styles.goalValue, { color: palette.cyan }]}>
                  {ACTIVITY_LABELS[metabolicProfile.activity_level] ??
                    metabolicProfile.activity_level}
                </Text>
              </View>

              {!hasBodyFat ? (
                <View style={styles.formulaHint}>
                  <Ionicons name="information-circle-outline" size={14} color={palette.amber} />
                  <Text style={styles.formulaHintText}>
                    Realiza un Body Scan para activar la fórmula Katch-McArdle (más precisa)
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.emptyState}>
              Completa tu perfil para ver tu metabolismo calculado.
            </Text>
          )}
        </GlassCard>

        {/* ── Logout ──────────────────────────────────── */}
        <GlassCard style={styles.section}>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.menuIconBox, { backgroundColor: `${palette.coral}12` }]}>
              <Ionicons name="log-out-outline" size={20} color={palette.coral} />
            </View>
            <Text style={[styles.menuLabel, { color: palette.coral }]}>Cerrar Sesión</Text>
            <Ionicons name="chevron-forward" size={18} color={palette.gray500} />
          </Pressable>
        </GlassCard>

        <Text style={styles.version}>BestMe v1.0.0</Text>
        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.dark900 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing['2xl'] },

  // Profile Header
  profileHeader: { alignItems: 'center', marginBottom: Spacing.xl },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: {
    color: palette.white,
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
  },
  profileName: {
    color: palette.white,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
  },
  profileEmail: { color: palette.gray300, fontSize: Typography.size.md, marginTop: 4 },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
    backgroundColor: 'rgba(255, 179, 64, 0.08)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  memberText: {
    color: palette.amber,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
  },

  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    marginBottom: Spacing.base,
  },
  emptyState: {
    color: palette.gray400,
    fontSize: Typography.size.sm,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },

  // Metrics
  metricsGrid: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  metricItem: { alignItems: 'center', flex: 1 },
  metricValue: {
    color: palette.white,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
  },
  metricLabel: { color: palette.gray400, fontSize: Typography.size.xs, marginTop: 4 },
  metricDivider: { width: 1, height: 35, backgroundColor: 'rgba(255,255,255,0.06)' },

  // Weight editing
  weightEditTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.base,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  weightEditTriggerText: {
    color: palette.emerald,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
  },
  weightEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.base,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  weightInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.sm,
    color: palette.white,
    fontSize: Typography.size.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  weightSaveBtn: {
    backgroundColor: palette.emerald,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 78,
    alignItems: 'center',
  },
  weightSaveText: {
    color: palette.dark900,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  weightCancelBtn: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  weightCancelText: { color: palette.gray400, fontSize: Typography.size.sm },

  // Scan CTA
  scanCta: { borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  scanCtaContent: { flexDirection: 'row', alignItems: 'center' },
  scanCtaLeft: { flex: 1 },
  scanBadge: {
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
  scanBadgeText: {
    color: palette.white,
    fontSize: 10,
    fontWeight: Typography.weight.bold,
    letterSpacing: 1,
  },
  scanCtaTitle: {
    color: palette.white,
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    marginBottom: 4,
  },
  scanCtaDesc: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: Typography.size.sm,
    lineHeight: 18,
  },
  scanIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
  },

  // Metabolic
  metabolicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formulaBadge: {
    backgroundColor: 'rgba(0, 201, 219, 0.10)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.base,
  },
  formulaText: {
    color: palette.cyan,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
  },
  metabolicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: Spacing.base,
  },
  metabolicItem: { alignItems: 'center' },
  metabolicLabel: {
    color: palette.gray300,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metabolicValue: {
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
    marginTop: 4,
  },
  metabolicUnit: { color: palette.gray400, fontSize: Typography.size.xs, marginTop: 2 },
  metabolicArrow: { alignItems: 'center' },
  metabolicMultiplier: { color: palette.gray400, fontSize: Typography.size.xs, marginTop: 2 },

  leanMassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginBottom: Spacing.base,
  },
  leanMassText: { color: palette.cyan, fontSize: Typography.size.xs },

  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 214, 143, 0.06)',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  goalLabel: { color: palette.gray300, fontSize: Typography.size.sm },
  goalValue: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, flex: 1 },
  goalTarget: {
    color: palette.white,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  formulaHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(255, 179, 64, 0.06)',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  formulaHintText: {
    color: palette.amber,
    fontSize: Typography.size.xs,
    flex: 1,
    lineHeight: 16,
  },

  // Menu
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    color: palette.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    flex: 1,
  },

  version: {
    color: palette.gray500,
    fontSize: Typography.size.xs,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
});
