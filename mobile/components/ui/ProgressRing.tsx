/**
 * BestMe — ProgressRing Component
 * ==================================
 * Animated circular progress indicator for calories and macros.
 * Uses SVG-free approach with border-based rendering for performance.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Text } from 'react-native';
import { palette } from '@/constants/Colors';
import { Typography } from '@/constants/Theme';

interface ProgressRingProps {
  /** Progress from 0 to 1 */
  progress: number;
  /** Size of the ring in pixels */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Color of the progress arc */
  color?: string;
  /** Background ring color */
  bgColor?: string;
  /** Label text inside the ring */
  label?: string;
  /** Value text inside the ring (large number) */
  value?: string;
  /** Subtitle under value */
  subtitle?: string;
}

export function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 8,
  color = palette.emerald,
  bgColor = 'rgba(255, 255, 255, 0.06)',
  label,
  value,
  subtitle,
}: ProgressRingProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const clampedProgress = Math.min(Math.max(progress, 0), 1);

  useEffect(() => {
    Animated.spring(animatedValue, {
      toValue: clampedProgress,
      useNativeDriver: false,
      tension: 40,
      friction: 8,
    }).start();
  }, [clampedProgress]);

  const innerSize = size - strokeWidth * 2;

  // We simulate a ring with rotating half-circles
  const rotation = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Background ring */}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: bgColor,
          },
        ]}
      />

      {/* Progress ring — simplified visual using border */}
      <View style={[styles.progressContainer, { width: size, height: size }]}>
        <Animated.View
          style={[
            styles.halfCircle,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: color,
              borderRightColor: 'transparent',
              borderBottomColor: 'transparent',
              transform: [{ rotate: rotation }],
            },
          ]}
        />
        {clampedProgress > 0.5 && (
          <View
            style={[
              styles.halfCircle,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: strokeWidth,
                borderColor: color,
                borderRightColor: 'transparent',
                borderBottomColor: 'transparent',
                transform: [{ rotate: '180deg' }],
              },
            ]}
          />
        )}
      </View>

      {/* Center content */}
      <View style={[styles.center, { width: innerSize, height: innerSize }]}>
        {label && <Text style={styles.label}>{label}</Text>}
        {value && <Text style={[styles.value, { color }]}>{value}</Text>}
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
  },
  progressContainer: {
    position: 'absolute',
  },
  halfCircle: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: palette.gray300,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  value: {
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
    marginTop: 2,
  },
  subtitle: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    marginTop: 1,
  },
});
