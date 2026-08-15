/**
 * BestMe — Typography System
 * ============================
 * Consistent font scale and weights for the entire app.
 */

export const Typography = {
  // ── Font Families ──────────────────────────────
  fontFamily: {
    regular: 'SpaceMono',
    // Will be extended with Google Fonts (Inter) in later phases
  },

  // ── Font Sizes ─────────────────────────────────
  size: {
    xs: 10,
    sm: 12,
    md: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },

  // ── Line Heights ───────────────────────────────
  lineHeight: {
    tight: 1.1,
    normal: 1.4,
    relaxed: 1.6,
  },

  // ── Font Weights ───────────────────────────────
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
};
