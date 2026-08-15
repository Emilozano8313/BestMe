/**
 * BestMe — Line Chart
 * =====================
 * Single-series trend over time. Used for the weight curve.
 *
 * One series, so there is no legend — the card title names it. The latest
 * point is direct-labelled and the rest are left to the axis and the touch
 * readout, rather than printing a number on every dot.
 */

import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

/**
 * Horizontal chrome between the window edge and the plot: the screen's
 * padding plus the card's, on both sides. Used to seed the width so the
 * chart draws on first paint instead of waiting for a measurement — on
 * react-native-web `onLayout` may never fire, which left the plot blank.
 */
const CHART_INSET = 2 * (Spacing.lg + Spacing.base);

import { chartPalette, palette } from '@/constants/Colors';
import { Typography, Spacing } from '@/constants/Theme';

export interface LinePoint {
  /** ISO date, used for the axis label. */
  date: string;
  value: number | null;
}

interface LineChartProps {
  points: LinePoint[];
  /** Appended to the direct label and the readout, e.g. "kg". */
  unit?: string;
  height?: number;
  /** Decimals shown in labels. */
  precision?: number;
}

// `bottom` is small on purpose: the x-axis labels render below the SVG as
// real text, so reserving a band for them inside it would leave dead space.
const PADDING = { top: 16, right: 14, bottom: 8, left: 40 };
const GRID_LINES = 3;

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function LineChart({ points, unit = '', height = 190, precision = 1 }: LineChartProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Prefer the real measurement when it arrives; fall back to the window so
  // the chart is never blank.
  const width = measuredWidth || Math.max(0, windowWidth - CHART_INSET);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0) setMeasuredWidth(next);
  };

  // Only points with a value are plotted; gaps stay gaps rather than being
  // interpolated into a line that implies data we never recorded.
  const measured = useMemo(
    () => points.map((p, i) => ({ ...p, i })).filter((p) => p.value !== null),
    [points],
  );

  const scale = useMemo(() => {
    if (measured.length === 0 || width === 0) return null;

    const values = measured.map((p) => p.value as number);
    let min = Math.min(...values);
    let max = Math.max(...values);

    // A flat series would otherwise divide by zero; give it a visible band.
    if (max - min < 0.6) {
      const mid = (max + min) / 2;
      min = mid - 0.5;
      max = mid + 0.5;
    } else {
      const margin = (max - min) * 0.15;
      min -= margin;
      max += margin;
    }

    const plotW = Math.max(1, width - PADDING.left - PADDING.right);
    const plotH = Math.max(1, height - PADDING.top - PADDING.bottom);
    const lastIndex = Math.max(1, points.length - 1);

    return {
      min,
      max,
      x: (i: number) => PADDING.left + (i / lastIndex) * plotW,
      y: (v: number) => PADDING.top + (1 - (v - min) / (max - min)) * plotH,
      plotW,
      plotH,
    };
  }, [measured, width, height, points.length]);

  const path = useMemo(() => {
    if (!scale || measured.length === 0) return '';
    return measured
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${scale.x(p.i)} ${scale.y(p.value as number)}`)
      .join(' ');
  }, [measured, scale]);

  if (measured.length === 0) {
    return (
      <View style={[styles.empty, { height }]} onLayout={onLayout}>
        <Text style={styles.emptyText}>Aún no hay datos suficientes</Text>
      </View>
    );
  }

  const latest = measured[measured.length - 1];
  const active = activeIndex !== null ? measured.find((p) => p.i === activeIndex) : null;
  const shown = active ?? latest;

  return (
    <View onLayout={onLayout}>
      {width > 0 && scale ? (
        <>
          <Svg width={width} height={height}>
            {/* Recessive hairline grid — solid, never dashed. */}
            {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
              const y = PADDING.top + (i / GRID_LINES) * scale.plotH;
              return (
                <Line
                  key={i}
                  x1={PADDING.left}
                  y1={y}
                  x2={width - PADDING.right}
                  y2={y}
                  stroke={chartPalette.grid}
                  strokeWidth={1}
                />
              );
            })}

            <Path
              d={path}
              stroke={chartPalette.primary}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Markers only where we actually measured. */}
            {measured.map((p) => {
              const isActive = p.i === shown.i;
              return (
                <Circle
                  key={p.i}
                  cx={scale.x(p.i)}
                  cy={scale.y(p.value as number)}
                  r={isActive ? 5 : 3.5}
                  fill={chartPalette.primary}
                  // 2px surface ring instead of a border around the mark.
                  stroke={chartPalette.surface}
                  strokeWidth={2}
                />
              );
            })}

            {/* Touch targets, comfortably larger than the 3.5px dots. */}
            {measured.map((p) => (
              <Rect
                key={`hit-${p.i}`}
                x={scale.x(p.i) - 14}
                y={0}
                width={28}
                height={height}
                fill="transparent"
                onPressIn={() => setActiveIndex(p.i)}
              />
            ))}
          </Svg>

          {/* Y-axis extremes and the date range, in text tokens — never the
              series color, which would double-encode identity. */}
          <View style={[styles.yLabels, { height: height - PADDING.bottom }]} pointerEvents="none">
            <Text style={styles.axisLabel}>
              {scale.max.toFixed(precision)}
            </Text>
            <Text style={styles.axisLabel}>
              {scale.min.toFixed(precision)}
            </Text>
          </View>

          <View style={styles.xLabels}>
            <Text style={styles.axisLabel}>{formatDay(points[0]?.date ?? '')}</Text>
            <Text style={styles.axisLabel}>
              {formatDay(points[points.length - 1]?.date ?? '')}
            </Text>
          </View>
        </>
      ) : (
        <View style={{ height }} />
      )}

      {/* Readout: the value is reachable without hovering. */}
      <View style={styles.readout}>
        <View style={[styles.swatch, { backgroundColor: chartPalette.primary }]} />
        <Text style={styles.readoutValue}>
          {(shown.value as number).toFixed(precision)}
          {unit ? ` ${unit}` : ''}
        </Text>
        <Text style={styles.readoutDate}>
          {active ? formatDay(shown.date) : 'último registro'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: palette.gray400, fontSize: Typography.size.sm },

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
    fontVariant: ['tabular-nums'],
  },

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
  readoutDate: { color: palette.gray400, fontSize: Typography.size.xs },
});
