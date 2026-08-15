/**
 * BestMe — GlassCard Component
 * ==============================
 * A premium glassmorphism card with subtle blur and glow effects.
 */

import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette } from '@/constants/Colors';
import { BorderRadius, Spacing } from '@/constants/Theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'highlight' | 'dark';
  gradient?: string[];
}

export function GlassCard({ children, style, variant = 'default', gradient }: GlassCardProps) {
  const gradientColors = gradient || getGradientForVariant(variant);

  return (
    <View style={[styles.wrapper, style]}>
      <LinearGradient
        colors={gradientColors as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.inner}>
          {children}
        </View>
      </LinearGradient>
    </View>
  );
}

function getGradientForVariant(variant: string): string[] {
  switch (variant) {
    case 'highlight':
      return ['rgba(0, 214, 143, 0.15)', 'rgba(0, 201, 219, 0.08)'];
    case 'dark':
      return ['rgba(18, 18, 26, 0.95)', 'rgba(26, 26, 40, 0.90)'];
    default:
      return ['rgba(26, 26, 40, 0.80)', 'rgba(36, 36, 56, 0.60)'];
  }
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  gradient: {
    borderRadius: BorderRadius.lg,
  },
  inner: {
    padding: Spacing.base,
  },
});
