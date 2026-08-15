/**
 * BestMe — Macro Split
 * ======================
 * Part-to-whole: how the day's calories divide between protein, carbs and fat.
 *
 * A horizontal stacked bar rather than a donut — the three shares are often
 * close, and length is far easier to compare than angle. Three categorical
 * series, so a legend is always present, and each segment is direct-labelled
 * when it is wide enough to hold the text without clipping.
 *
 * Colors come from `chartPalette` (validated for colorblind separation), not
 * from the UI palette. Segments are separated by a 2px surface gap rather
 * than by drawing borders around them.
 */

import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';

import { chartPalette, palette } from '@/constants/Colors';
import { Typography, Spacing, BorderRadius } from '@/constants/Theme';

export interface MacroTotals {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface MacroStackProps {
  totals: MacroTotals;
  /** Optional daily targets, shown as a second, muted comparison row. */
  targets?: MacroTotals | null;
}

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Fixed order — never reordered or cycled; the order is the safety guarantee. */
const SERIES = [
  { key: 'protein', label: 'Proteína', color: chartPalette.protein },
  { key: 'carbs', label: 'Carbos', color: chartPalette.carbs },
  { key: 'fat', label: 'Grasas', color: chartPalette.fat },
] as const;

const BAR_HEIGHT = 26;
const SEGMENT_GAP = 2;
/** Below this a label cannot fit with padding, so it moves to the legend. */
const MIN_LABEL_WIDTH = 46;

/** Screen padding + card padding, both sides. See LineChart for why. */
const CHART_INSET = 2 * (Spacing.lg + Spacing.base);

export function MacroStack({ totals, targets }: MacroStackProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const width = measuredWidth || Math.max(0, windowWidth - CHART_INSET);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0) setMeasuredWidth(next);
  };

  const kcal = useMemo(
    () => ({
      protein: totals.protein_g * KCAL_PER_G.protein,
      carbs: totals.carbs_g * KCAL_PER_G.carbs,
      fat: totals.fat_g * KCAL_PER_G.fat,
    }),
    [totals],
  );

  const totalKcal = kcal.protein + kcal.carbs + kcal.fat;

  if (totalKcal <= 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Sin comidas registradas en este periodo</Text>
      </View>
    );
  }

  const grams = { protein: totals.protein_g, carbs: totals.carbs_g, fat: totals.fat_g };
  const targetGrams = targets
    ? { protein: targets.protein_g, carbs: targets.carbs_g, fat: targets.fat_g }
    : null;

  // Widths, less the gaps between segments.
  const usable = Math.max(0, width - SEGMENT_GAP * (SERIES.length - 1));

  return (
    <View>
      <View style={styles.barRow} onLayout={onLayout}>
        {SERIES.map((series, index) => {
          const share = kcal[series.key] / totalKcal;
          const segmentWidth = usable * share;
          const percent = Math.round(share * 100);
          const dimmed = selected !== null && selected !== series.key;

          return (
            <Pressable
              key={series.key}
              onPress={() => setSelected(selected === series.key ? null : series.key)}
              style={[
                styles.segment,
                {
                  width: segmentWidth,
                  backgroundColor: series.color,
                  opacity: dimmed ? 0.4 : 1,
                  marginRight: index < SERIES.length - 1 ? SEGMENT_GAP : 0,
                  borderTopLeftRadius: index === 0 ? BorderRadius.sm : 0,
                  borderBottomLeftRadius: index === 0 ? BorderRadius.sm : 0,
                  borderTopRightRadius: index === SERIES.length - 1 ? BorderRadius.sm : 0,
                  borderBottomRightRadius: index === SERIES.length - 1 ? BorderRadius.sm : 0,
                },
              ]}
            >
              {/* Only labelled when it fits; otherwise the legend carries it. */}
              {segmentWidth >= MIN_LABEL_WIDTH ? (
                <Text style={styles.segmentLabel} numberOfLines={1}>
                  {percent}%
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Legend — always present for 3 series, so identity is never color-alone. */}
      <View style={styles.legend}>
        {SERIES.map((series) => {
          const g = Math.round(grams[series.key]);
          const t = targetGrams ? Math.round(targetGrams[series.key]) : null;
          return (
            <Pressable
              key={series.key}
              onPress={() => setSelected(selected === series.key ? null : series.key)}
              style={styles.legendItem}
            >
              <View style={[styles.legendSwatch, { backgroundColor: series.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.legendLabel}>{series.label}</Text>
                <Text style={styles.legendValue}>
                  {g} g{t !== null ? <Text style={styles.legendTarget}> / {t} g</Text> : null}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.footnote}>
        Los porcentajes son sobre las calorías ({Math.round(totalKcal)} kcal al día).
        {targetGrams ? ' El segundo número es tu objetivo.' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: Spacing.xl, alignItems: 'center' },
  emptyText: { color: palette.gray400, fontSize: Typography.size.sm, textAlign: 'center' },

  barRow: { flexDirection: 'row', height: BAR_HEIGHT, width: '100%' },
  segment: { height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  segmentLabel: {
    color: palette.white,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
  },

  legend: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.base },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { color: palette.gray300, fontSize: Typography.size.xs },
  legendValue: {
    color: palette.white,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },
  legendTarget: { color: palette.gray400, fontWeight: Typography.weight.regular },

  footnote: { color: palette.gray500, fontSize: Typography.size.xs, marginTop: Spacing.sm },
});
