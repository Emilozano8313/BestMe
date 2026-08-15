/**
 * BestMe — MacroBar Component
 * ==============================
 * Horizontal progress bar for macro nutrient tracking.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Text } from 'react-native';
import { palette } from '@/constants/Colors';
import { Typography, BorderRadius, Spacing } from '@/constants/Theme';

interface MacroBarProps {
  label: string;
  current: number;
  target: number;
  unit?: string;
  color: string;
}

export function MacroBar({ label, current, target, unit = 'g', color }: MacroBarProps) {
  const progress = target > 0 ? Math.min(current / target, 1) : 0;
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(animatedWidth, {
      toValue: progress,
      useNativeDriver: false,
      tension: 50,
      friction: 10,
    }).start();
  }, [progress]);

  const widthInterpolation = animatedWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={styles.label}>{label}</Text>
        </View>
        <Text style={styles.values}>
          <Text style={[styles.current, { color }]}>{current}</Text>
          <Text style={styles.separator}> / </Text>
          <Text style={styles.target}>{target}{unit}</Text>
        </Text>
      </View>
      <View style={styles.trackOuter}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: widthInterpolation,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  label: {
    color: palette.gray200,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
  },
  values: {
    fontSize: Typography.size.sm,
  },
  current: {
    fontWeight: Typography.weight.bold,
  },
  separator: {
    color: palette.gray400,
  },
  target: {
    color: palette.gray400,
    fontWeight: Typography.weight.regular,
  },
  trackOuter: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
});
