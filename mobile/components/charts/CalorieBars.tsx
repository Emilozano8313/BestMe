/**
 * BestMe — Calories vs Target
 * =============================
 * Daily intake as bars against the calorie target as a reference line.
 *
 * The reader's job is "how far off target was I", so the target is drawn as
 * a baseline the bars are read against — not as a second series on a second
 * axis, which would invent a relationship between two different scales.
 *
 * Bars are one hue. Over-target days are marked with a lighter step of the
 * *same* hue rather than a status color: eating above target is not an
 * error, and reserving red for it would overstate it.
 */

import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { chartPalette, palette } from '@/constants/Colors';
import { Typography, Spacing } from '@/constants/Theme';

export interface CalorieDay {
  date: string;
  consumed: number;
  target: number | null;
}

interface CalorieBarsProps {
  days: CalorieDay[];
  height?: number;
}

// See LineChart: x-axis labels live below the SVG, so no band is reserved.
const PADDING = { top: 16, right: 12, bottom: 8, left: 42 };
const BAR_GAP = 2; // surface gap between adjacent bars
const RADIUS = 4; // rounded data-end

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** A lighter step of the same hue, for days above target. */
const OVER_TARGET = '#00D68F';

/** Screen padding + card padding, both sides. See LineChart for why. */
const CHART_INSET = 2 * (Spacing.lg + Spacing.base);

export function CalorieBars({ days, height = 200 }: CalorieBarsProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const width = measuredWidth || Math.max(0, windowWidth - CHART_INSET);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0) setMeasuredWidth(next);
  };

  const target = useMemo(() => {
    const withTarget = days.map((d) => d.target).filter((t): t is number => t !== null);
    if (withTarget.length === 0) return null;
    // The most recent target is the one the user is currently working to.
    return withTarget[withTarget.length - 1];
  }, [days]);

  const scale = useMemo(() => {
    if (width === 0 || days.length === 0) return null;

    const peak = Math.max(...days.map((d) => d.consumed), target ?? 0, 1);
    const max = peak * 1.15;

    const plotW = Math.max(1, width - PADDING.left - PADDING.right);
    const plotH = Math.max(1, height - PADDING.top - PADDING.bottom);
    const slot = plotW / days.length;

    return {
      max,
      slot,
      barWidth: Math.max(2, slot - BAR_GAP),
      x: (i: number) => PADDING.left + i * slot + BAR_GAP / 2,
      y: (v: number) => PADDING.top + (1 - v / max) * plotH,
      plotH,
      baseline: PADDING.top + plotH,
    };
  }, [days, width, height, target]);

  const logged = days.filter((d) => d.consumed > 0);
  if (logged.length === 0) {
    return (
      <View style={[styles.empty, { height }]} onLayout={onLayout}>
        <Text style={styles.emptyText}>Registra comidas para ver tu evolución</Text>
      </View>
    );
  }

  const active = activeIndex !== null ? days[activeIndex] : null;
  const shown = active ?? logged[logged.length - 1];
  const shownDiff = target ? Math.round(shown.consumed - target) : null;

  return (
    <View onLayout={onLayout}>
      {width > 0 && scale ? (
        <>
          <Svg width={width} height={height}>
            {days.map((day, i) => {
              if (day.consumed <= 0) return null;
              const y = scale.y(day.consumed);
              const barHeight = Math.max(RADIUS, scale.baseline - y);
              const over = target !== null && day.consumed > target;
              return (
                <Rect
                  key={day.date}
                  x={scale.x(i)}
                  y={y}
                  width={scale.barWidth}
                  height={barHeight}
                  // Rounded data-end; the bar stays anchored to the baseline.
                  rx={RADIUS}
                  fill={over ? OVER_TARGET : chartPalette.primary}
                  opacity={activeIndex === null || activeIndex === i ? 1 : 0.45}
                />
              );
            })}

            {/* Target baseline — solid hairline, labelled below. */}
            {target !== null ? (
              <Line
                x1={PADDING.left}
                y1={scale.y(target)}
                x2={width - PADDING.right}
                y2={scale.y(target)}
                stroke={chartPalette.reference}
                strokeWidth={1}
              />
            ) : null}

            {/* Axis rule */}
            <Line
              x1={PADDING.left}
              y1={scale.baseline}
              x2={width - PADDING.right}
              y2={scale.baseline}
              stroke={chartPalette.axis}
              strokeWidth={1}
            />

            {/* Touch targets spanning the full column height. */}
            {days.map((day, i) => (
              <Rect
                key={`hit-${day.date}`}
                x={PADDING.left + i * scale.slot}
                y={0}
                width={Math.max(24, scale.slot)}
                height={height}
                fill="transparent"
                onPressIn={() => setActiveIndex(i)}
              />
            ))}
          </Svg>

          <View style={[styles.yLabels, { height: height - PADDING.bottom }]} pointerEvents="none">
            <Text style={styles.axisLabel}>{Math.round(scale.max)}</Text>
            {target !== null ? (
              <Text
                style={[
                  styles.axisLabel,
                  styles.targetLabel,
                  { position: 'absolute', top: scale.y(target) - 14 },
                ]}
              >
                {Math.round(target)}
              </Text>
            ) : null}
            <Text style={styles.axisLabel}>0</Text>
          </View>

          <View style={styles.xLabels}>
            <Text style={styles.axisLabel}>{formatDay(days[0]?.date ?? '')}</Text>
            <Text style={styles.axisLabel}>{formatDay(days[days.length - 1]?.date ?? '')}</Text>
          </View>
        </>
      ) : (
        <View style={{ height }} />
      )}

      <View style={styles.readout}>
        <View style={[styles.swatch, { backgroundColor: chartPalette.primary }]} />
        <Text style={styles.readoutValue}>{Math.round(shown.consumed)} kcal</Text>
        {shownDiff !== null ? (
          <Text style={styles.readoutDate}>
            {shownDiff === 0
              ? 'justo en el objetivo'
              : shownDiff > 0
                ? `${shownDiff} sobre el objetivo`
                : `${Math.abs(shownDiff)} por debajo`}
          </Text>
        ) : null}
      </View>
      {target !== null ? (
        <Text style={styles.footnote}>
          La línea marca tu objetivo diario ({Math.round(target)} kcal).
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: palette.gray400, fontSize: Typography.size.sm, textAlign: 'center' },

  yLabels: {
    position: 'absolute',
    left: 0,
    top: 8,
    width: PADDING.left - 6,
    justifyContent: 'space-between',
  },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: PADDING.left },
  axisLabel: {
    color: palette.gray400,
    fontSize: Typography.size.xs,
    textAlign: 'right',
    width: PADDING.left - 6,
    fontVariant: ['tabular-nums'],
  },
  targetLabel: { color: palette.gray300 },

  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  readoutValue: {
    color: palette.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
  },
  readoutDate: { color: palette.gray400, fontSize: Typography.size.xs, flex: 1 },
  footnote: { color: palette.gray500, fontSize: Typography.size.xs, marginTop: 4 },
});
