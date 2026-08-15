/**
 * BestMe — Onboarding Step 2: Body
 * ===================================
 * Captures height (cm), weight (kg), and optional body fat percentage.
 * Explains that providing body fat enables a more accurate equation.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { ProgressBar } from '@/components/ui/ProgressBar';

export default function StepBody() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date_of_birth: string; gender: string }>();

  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [showBodyFat, setShowBodyFat] = useState(false);
  const [bodyFat, setBodyFat] = useState('');
  const [error, setError] = useState('');

  const isValid =
    heightCm !== '' &&
    parseFloat(heightCm) > 0 &&
    weightKg !== '' &&
    parseFloat(weightKg) > 0;

  const handleContinue = () => {
    const height = parseFloat(heightCm);
    const weight = parseFloat(weightKg);

    if (isNaN(height) || height < 50 || height > 300) {
      setError('La altura debe estar entre 50 y 300 cm');
      return;
    }
    if (isNaN(weight) || weight < 20 || weight > 500) {
      setError('El peso debe estar entre 20 y 500 kg');
      return;
    }

    let bodyFatValue: string | null = null;
    if (showBodyFat && bodyFat !== '') {
      const bf = parseFloat(bodyFat);
      if (isNaN(bf) || bf < 1 || bf > 60) {
        setError('El % de grasa corporal debe estar entre 1 y 60');
        return;
      }
      bodyFatValue = bodyFat;
    }

    setError('');
    router.push({
      pathname: '/(onboarding)/step-goals',
      params: {
        ...params,
        height_cm: heightCm,
        weight_kg: weightKg,
        body_fat_percentage: bodyFatValue ?? '',
      },
    });
  };

  const handleBack = () => router.back();

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={[palette.dark900, palette.dark800]}
        style={styles.gradient}
      >
        <ProgressBar currentStep={2} totalSteps={4} />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Header ─────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="body-outline" size={44} color={palette.cyan} />
            </View>
            <Text style={styles.title}>Tu Cuerpo</Text>
            <Text style={styles.subtitle}>
              Estos datos nos permiten calcular tu metabolismo con precisión.
            </Text>
          </View>

          {/* ── Form ───────────────────────────────────── */}
          <View style={styles.form}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Height */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Altura</Text>
              <View style={styles.inputRow}>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    value={heightCm}
                    onChangeText={setHeightCm}
                    placeholder="178"
                    placeholderTextColor={palette.gray500}
                    keyboardType="decimal-pad"
                    maxLength={5}
                  />
                </View>
                <View style={styles.unitBadge}>
                  <Text style={styles.unitText}>cm</Text>
                </View>
              </View>
            </View>

            {/* Weight */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Peso</Text>
              <View style={styles.inputRow}>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    value={weightKg}
                    onChangeText={setWeightKg}
                    placeholder="82"
                    placeholderTextColor={palette.gray500}
                    keyboardType="decimal-pad"
                    maxLength={5}
                  />
                </View>
                <View style={styles.unitBadge}>
                  <Text style={styles.unitText}>kg</Text>
                </View>
              </View>
            </View>

            {/* Body Fat Toggle */}
            <View style={styles.bodyFatSection}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>¿Conoces tu % de grasa corporal?</Text>
                  <Text style={styles.toggleHint}>
                    Actívalo para usar una ecuación más precisa
                  </Text>
                </View>
                <Switch
                  value={showBodyFat}
                  onValueChange={setShowBodyFat}
                  trackColor={{ false: palette.dark500, true: palette.emeraldDark }}
                  thumbColor={showBodyFat ? palette.emerald : palette.gray400}
                />
              </View>

              {showBodyFat && (
                <View style={styles.bodyFatInput}>
                  <View style={styles.infoCard}>
                    <Ionicons name="information-circle-outline" size={16} color={palette.cyan} />
                    <Text style={styles.infoText}>
                      Al proporcionar tu % de grasa, usaremos la ecuación de Katch-McArdle
                      basada en masa magra, más precisa que Mifflin-St Jeor.
                    </Text>
                  </View>
                  <View style={styles.inputRow}>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        value={bodyFat}
                        onChangeText={setBodyFat}
                        placeholder="18.5"
                        placeholderTextColor={palette.gray500}
                        keyboardType="decimal-pad"
                        maxLength={4}
                      />
                    </View>
                    <View style={styles.unitBadge}>
                      <Text style={styles.unitText}>%</Text>
                    </View>
                  </View>
                </View>
              )}
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
                  Continuar
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={isValid ? palette.white : palette.gray400}
                />
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
    marginBottom: Spacing['2xl'],
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 201, 219, 0.10)',
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

  // Form
  form: { flex: 1 },
  errorText: {
    color: palette.coral,
    fontSize: Typography.size.sm,
    marginBottom: Spacing.base,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  label: {
    color: palette.gray200,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: BorderRadius.md,
  },
  input: {
    color: palette.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.semibold,
    letterSpacing: 1,
  },
  unitBadge: {
    backgroundColor: 'rgba(0, 214, 143, 0.10)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  unitText: {
    color: palette.emerald,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
  },

  // Body Fat
  bodyFatSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  toggleLabel: {
    color: palette.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.medium,
  },
  toggleHint: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: 2,
  },
  bodyFatInput: {
    marginTop: Spacing.base,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: 'rgba(0, 201, 219, 0.08)',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  infoText: {
    flex: 1,
    color: palette.gray300,
    fontSize: Typography.size.xs,
    lineHeight: 18,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xl,
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
