/**
 * BestMe — Profile Screen
 * ==========================
 * User profile with body metrics, body scan CTA,
 * metabolic info, and settings access.
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
const MOCK_PROFILE = {
  name: 'Carlos Mendoza',
  email: 'carlos@example.com',
  age: 28,
  height: 178,
  weight: 82.5,
  bodyFat: null as number | null, // null = no body scan yet
  activityLevel: 'Moderado',
  goal: 'Ganar Músculo',
  bmr: 1812,
  tdee: 2809,
  formula: 'Mifflin-St Jeor',
  memberSince: 'Agosto 2026',
};

const MENU_ITEMS = [
  { icon: 'person-outline' as const, label: 'Editar Perfil', color: palette.emerald },
  { icon: 'notifications-outline' as const, label: 'Notificaciones', color: palette.amber },
  { icon: 'moon-outline' as const, label: 'Modo Oscuro', color: palette.violet, toggle: true },
  { icon: 'shield-outline' as const, label: 'Privacidad', color: palette.cyan },
  { icon: 'help-circle-outline' as const, label: 'Ayuda y Soporte', color: palette.gray300 },
  { icon: 'log-out-outline' as const, label: 'Cerrar Sesión', color: palette.coral },
];

import { useAuth } from '@/context/AuthContext';

export default function ProfileScreen() {
  const { logout } = useAuth();

  const handleMenuPress = (label: string) => {
    if (label === 'Cerrar Sesión') {
      logout();
    }
  };

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
            <Text style={styles.avatarText}>
              {MOCK_PROFILE.name.split(' ').map(n => n[0]).join('')}
            </Text>
          </LinearGradient>
          <Text style={styles.profileName}>{MOCK_PROFILE.name}</Text>
          <Text style={styles.profileEmail}>{MOCK_PROFILE.email}</Text>
          <View style={styles.memberBadge}>
            <Ionicons name="star" size={12} color={palette.amber} />
            <Text style={styles.memberText}>Miembro desde {MOCK_PROFILE.memberSince}</Text>
          </View>
        </View>

        {/* ── Body Metrics ────────────────────────────── */}
        <GlassCard variant="highlight" style={styles.section}>
          <Text style={styles.sectionTitle}>Datos Corporales</Text>
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{MOCK_PROFILE.age}</Text>
              <Text style={styles.metricLabel}>Edad</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{MOCK_PROFILE.height}</Text>
              <Text style={styles.metricLabel}>Altura (cm)</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{MOCK_PROFILE.weight}</Text>
              <Text style={styles.metricLabel}>Peso (kg)</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={[styles.metricValue, !MOCK_PROFILE.bodyFat && { color: palette.gray400 }]}>
                {MOCK_PROFILE.bodyFat ? `${MOCK_PROFILE.bodyFat}%` : '—'}
              </Text>
              <Text style={styles.metricLabel}>Grasa Corp.</Text>
            </View>
          </View>
        </GlassCard>

        {/* ── Body Scan CTA ───────────────────────────── */}
        <Pressable style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
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
                  {MOCK_PROFILE.bodyFat
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
            <View style={styles.formulaBadge}>
              <Text style={styles.formulaText}>{MOCK_PROFILE.formula}</Text>
            </View>
          </View>

          <View style={styles.metabolicRow}>
            <View style={styles.metabolicItem}>
              <Text style={styles.metabolicLabel}>TMB</Text>
              <Text style={[styles.metabolicValue, { color: palette.cyan }]}>
                {MOCK_PROFILE.bmr}
              </Text>
              <Text style={styles.metabolicUnit}>kcal/día</Text>
            </View>
            <View style={styles.metabolicArrow}>
              <Ionicons name="arrow-forward" size={16} color={palette.gray400} />
              <Text style={styles.metabolicMultiplier}>× 1.55</Text>
            </View>
            <View style={styles.metabolicItem}>
              <Text style={styles.metabolicLabel}>TDEE</Text>
              <Text style={[styles.metabolicValue, { color: palette.emerald }]}>
                {MOCK_PROFILE.tdee}
              </Text>
              <Text style={styles.metabolicUnit}>kcal/día</Text>
            </View>
          </View>

          <View style={styles.goalRow}>
            <Ionicons name="trending-up" size={16} color={palette.emerald} />
            <Text style={styles.goalLabel}>Objetivo:</Text>
            <Text style={[styles.goalValue, { color: palette.emerald }]}>
              {MOCK_PROFILE.goal}
            </Text>
          </View>

          {!MOCK_PROFILE.bodyFat && (
            <View style={styles.formulaHint}>
              <Ionicons name="information-circle-outline" size={14} color={palette.amber} />
              <Text style={styles.formulaHintText}>
                Realiza un Body Scan para activar la fórmula Katch-McArdle (más precisa)
              </Text>
            </View>
          )}
        </GlassCard>

        {/* ── Settings Menu ───────────────────────────── */}
        <GlassCard style={styles.section}>
          {MENU_ITEMS.map((item, index) => (
            <Pressable
              key={item.label}
              onPress={() => handleMenuPress(item.label)}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { opacity: 0.7 },
                index < MENU_ITEMS.length - 1 && styles.menuItemBorder,
              ]}
            >
              <View style={[styles.menuIconBox, { backgroundColor: `${item.color}12` }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={[
                styles.menuLabel,
                item.label === 'Cerrar Sesión' && { color: palette.coral },
              ]}>
                {item.label}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={palette.gray500} />
            </Pressable>
          ))}
        </GlassCard>

        <Text style={styles.version}>BestMe v0.1.0</Text>
        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.dark900 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing['2xl'] },

  // Profile Header
  profileHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
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
  profileEmail: {
    color: palette.gray300,
    fontSize: Typography.size.md,
    marginTop: 4,
  },
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

  // Metrics
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  metricItem: { alignItems: 'center', flex: 1 },
  metricValue: {
    color: palette.white,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
  },
  metricLabel: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: 4,
  },
  metricDivider: {
    width: 1,
    height: 35,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // Scan CTA
  scanCta: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  scanCtaContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
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
  metabolicUnit: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: 2,
  },
  metabolicArrow: { alignItems: 'center' },
  metabolicMultiplier: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: 2,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 214, 143, 0.06)',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  goalLabel: {
    color: palette.gray300,
    fontSize: Typography.size.sm,
  },
  goalValue: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
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
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
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
