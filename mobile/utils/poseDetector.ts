/**
 * BestMe — Pose Detection Availability
 * ======================================
 * On-device pose detection needs two packages with native code:
 *
 *   react-native-vision-camera   camera frames + frame processors
 *   react-native-fast-tflite     runs the MoveNet model on each frame
 *
 * Neither can load in Expo Go, which ships a fixed set of native modules —
 * they require a Development Build. Rather than crash on import, this
 * module probes for them and reports what is available, so the trainer can
 * fall back to manual logging instead of showing a broken screen.
 *
 * See ENTRENADOR.md for the setup steps.
 */

export interface PoseDetectionStatus {
  available: boolean;
  /** Which piece is missing, for a precise message to the user. */
  missing: string[];
}

let cached: PoseDetectionStatus | null = null;

/**
 * Probe for the native modules.
 *
 * `require` is used rather than a static import on purpose: a static import
 * of a missing native module is a hard bundling failure, whereas this
 * degrades to `available: false`.
 */
export function getPoseDetectionStatus(): PoseDetectionStatus {
  if (cached) return cached;

  const missing: string[] = [];

  try {
    require('react-native-vision-camera');
  } catch {
    missing.push('react-native-vision-camera');
  }

  try {
    require('react-native-fast-tflite');
  } catch {
    missing.push('react-native-fast-tflite');
  }

  cached = { available: missing.length === 0, missing };
  return cached;
}
