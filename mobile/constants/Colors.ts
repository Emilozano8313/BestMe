/**
 * BestMe — Design System Colors
 * ===============================
 * Premium dark-first palette with vibrant accent gradients.
 * Inspired by modern health & fitness apps (Strava, Whoop, MyFitnessPal).
 */

const palette = {
  // ── Core Brand ──────────────────────────────────
  emerald: '#00D68F',
  emeraldLight: '#33E5A8',
  emeraldDark: '#00B377',
  cyan: '#00C9DB',
  cyanLight: '#33D9E8',

  // ── Accent Gradients ───────────────────────────
  coral: '#FF6B6B',
  coralLight: '#FF8E8E',
  amber: '#FFB340',
  amberLight: '#FFC966',
  violet: '#8B5CF6',
  violetLight: '#A78BFA',

  // ── Neutrals (Dark Mode First) ─────────────────
  black: '#000000',
  dark900: '#0A0A0F',
  dark800: '#12121A',
  dark700: '#1A1A28',
  dark600: '#242438',
  dark500: '#2E2E48',
  dark400: '#3A3A58',

  // ── Text ───────────────────────────────────────
  white: '#FFFFFF',
  gray100: '#F0F0F5',
  gray200: '#D1D1DB',
  gray300: '#A0A0B8',
  gray400: '#6B6B88',
  gray500: '#4A4A68',

  // ── Semantic ───────────────────────────────────
  success: '#00D68F',
  warning: '#FFB340',
  error: '#FF4D6A',
  info: '#00C9DB',

  // ── Macros ─────────────────────────────────────
  protein: '#00D68F',
  carbs: '#FFB340',
  fat: '#FF6B6B',
  calories: '#8B5CF6',
};

const Colors = {
  light: {
    text: palette.dark900,
    textSecondary: palette.gray400,
    background: palette.gray100,
    cardBackground: palette.white,
    tint: palette.emerald,
    tabIconDefault: palette.gray300,
    tabIconSelected: palette.emerald,
    border: '#E0E0E8',
    ...palette,
  },
  dark: {
    text: palette.white,
    textSecondary: palette.gray300,
    background: palette.dark900,
    cardBackground: palette.dark700,
    tint: palette.emerald,
    tabIconDefault: palette.gray400,
    tabIconSelected: palette.emerald,
    border: palette.dark500,
    ...palette,
  },
};

export default Colors;
export { palette };
