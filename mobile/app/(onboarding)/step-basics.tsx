/**
 * BestMe — Onboarding Step 1: Basics
 * =====================================
 * Captures date of birth and gender.
 * Premium dark mode with animated progress bar.
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';
import { ProgressBar } from '@/components/ui/ProgressBar';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Masculino', icon: 'male-outline' as const },
  { value: 'female', label: 'Femenino', icon: 'female-outline' as const },
  { value: 'other', label: 'Otro', icon: 'person-outline' as const },
];

export default function StepBasics() {
  const router = useRouter();
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [error, setError] = useState('');

  const isValid = dateOfBirth.length === 10 && gender !== '';

  const handleContinue = () => {
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateOfBirth)) {
      setError('Formato de fecha inválido. Usa AAAA-MM-DD');
      return;
    }

    const parsedDate = new Date(dateOfBirth);
    if (isNaN(parsedDate.getTime())) {
      setError('Fecha inválida');
      return;
    }

    // Check age is reasonable (13–120 years)
    const today = new Date();
    const age = today.getFullYear() - parsedDate.getFullYear();
    if (age < 13 || age > 120) {
      setError('La edad debe estar entre 13 y 120 años');
      return;
    }

    setError('');
    router.push({
      pathname: '/(onboarding)/step-body',
      params: { date_of_birth: dateOfBirth, gender },
    });
  };

  const formatDateInput = (text: string) => {
    // Auto-format as YYYY-MM-DD while typing
    const cleaned = text.replace(/[^0-9]/g, '');
    let formatted = cleaned;
    if (cleaned.length > 4) {
      formatted = cleaned.slice(0, 4) + '-' + cleaned.slice(4);
    }
    if (cleaned.length > 6) {
      formatted = formatted.slice(0, 7) + '-' + cleaned.slice(6, 8);
    }
    setDateOfBirth(formatted.slice(0, 10));
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={[palette.dark900, palette.dark800]}
        style={styles.gradient}
      >
        <ProgressBar currentStep={1} totalSteps={4} />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Header ─────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="person-circle-outline" size={48} color={palette.emerald} />
            </View>
            <Text style={styles.title}>Cuéntanos sobre ti</Text>
            <Text style={styles.subtitle}>
              Necesitamos algunos datos básicos para personalizar tu plan de salud.
            </Text>
          </View>

          {/* ── Form ───────────────────────────────────── */}
          <View style={styles.form}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Date of Birth */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Fecha de Nacimiento</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="calendar-outline" size={20} color={palette.gray400} style={styles.inputIcon} />
                <TextInput
                  style={styles.inputWithIcon}
                  value={dateOfBirth}
                  onChangeText={formatDateInput}
                  placeholder="1995-06-15"
                  placeholderTextColor={palette.gray500}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
            </View>

            {/* Gender Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Sexo Biológico</Text>
              <Text style={styles.hint}>Utilizado para el cálculo metabólico</Text>
              <View style={styles.genderGrid}>
                {GENDER_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.genderCard,
                      gender === option.value && styles.genderCardActive,
                    ]}
                    onPress={() => setGender(option.value)}
                  >
                    {gender === option.value ? (
                      <LinearGradient
                        colors={[
                          'rgba(0, 214, 143, 0.20)',
                          'rgba(0, 201, 219, 0.12)',
                        ]}
                        style={styles.genderCardGradient}
                      >
                        <Ionicons
                          name={option.icon}
                          size={28}
                          color={palette.emerald}
                        />
                        <Text style={styles.genderLabelActive}>
                          {option.label}
                        </Text>
                      </LinearGradient>
                    ) : (
                      <View style={styles.genderCardInner}>
                        <Ionicons
                          name={option.icon}
                          size={28}
                          color={palette.gray400}
                        />
                        <Text style={styles.genderLabel}>{option.label}</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* ── Continue Button ────────────────────────── */}
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
    backgroundColor: 'rgba(0, 214, 143, 0.10)',
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
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  hint: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginBottom: Spacing.md,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: BorderRadius.md,
  },
  inputIcon: {
    paddingLeft: Spacing.md,
  },
  inputWithIcon: {
    flex: 1,
    color: palette.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.size.lg,
    letterSpacing: 2,
  },

  // Gender Selection
  genderGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  genderCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  genderCardActive: {
    borderColor: palette.emerald,
    borderWidth: 1.5,
  },
  genderCardInner: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  genderCardGradient: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  genderLabel: {
    color: palette.gray400,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
  },
  genderLabelActive: {
    color: palette.emerald,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },

  // Button
  button: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginTop: Spacing.xl,
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
