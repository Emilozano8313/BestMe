/**
 * BestMe — ProgressBar Component
 * ================================
 * Animated multi-segment progress bar for the onboarding flow.
 * Visually shows completion across N steps with emerald-to-cyan gradient fills.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette } from '@/constants/Colors';
import { BorderRadius, Spacing } from '@/constants/Theme';

interface ProgressBarProps {
  /** Current step (1-indexed) */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
}

export function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
  const animatedWidths = useRef(
    Array.from({ length: totalSteps }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    // Animate each segment based on currentStep
    animatedWidths.forEach((anim, index) => {
      const targetValue = index < currentStep ? 1 : 0;
      Animated.spring(anim, {
        toValue: targetValue,
        useNativeDriver: false,
        tension: 60,
        friction: 10,
      }).start();
    });
  }, [currentStep]);

  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }, (_, index) => (
        <View key={index} style={styles.segmentWrapper}>
          {/* Background track */}
          <View style={styles.track} />
          {/* Animated fill */}
          <Animated.View
            style={[
              styles.fillContainer,
              {
                width: animatedWidths[index].interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          >
            <LinearGradient
              colors={[palette.emerald, palette.cyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fill}
            />
          </Animated.View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base,
  },
  segmentWrapper: {
    flex: 1,
    height: 4,
    position: 'relative',
  },
  track: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.dark500,
    borderRadius: BorderRadius.full,
  },
  fillContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
    borderRadius: BorderRadius.full,
  },
});
