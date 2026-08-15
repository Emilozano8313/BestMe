/**
 * BestMe — Biomechanics Engine
 * ==============================
 * Joint kinematics and injury-prevention checks, computed on-device.
 *
 * Works on a `Pose` (named joints) rather than a raw landmark array, so the
 * same maths serves MediaPipe/BlazePose and MoveNet/COCO frames — see
 * `utils/pose.ts` for the adapters.
 */

import { type Point3D, type Pose, isPoseUsable } from './pose';

export type { Point3D, Pose };

export type RepPhase = 'concentric' | 'eccentric' | 'standing';

export interface BiomechanicsState {
  reps: number;
  phase: RepPhase;
  formScore: number;
  issues: string[];
  lastHipAngle: number;
  lastKneeAngle: number;
  /** Deepest knee angle reached in the current rep, for depth feedback. */
  deepestKneeAngle: number;
}

export const INITIAL_STATE: BiomechanicsState = {
  reps: 0,
  phase: 'standing',
  formScore: 1.0,
  issues: [],
  lastHipAngle: 180,
  lastKneeAngle: 180,
  deepestKneeAngle: 180,
};

// ── Thresholds ───────────────────────────────────────────────────
// Knee angle: 180° is a straight leg, smaller means deeper.

const KNEE_STANDING = 160;
/** Below this, the descent has begun. */
const KNEE_DESCENT_START = 150;
/** A dip must reach at least this depth to count as a rep at all. */
const KNEE_MIN_REP_DEPTH = 130;
/** Below this is roughly parallel; above it the rep is flagged as shallow. */
const KNEE_DEPTH_TARGET = 100;

/** Hip angle below this in the sagittal plane suggests the back is rounding. */
const HIP_ROUNDING = 50;

/** Knees closer together than this fraction of ankle width = valgus. */
const VALGUS_RATIO = 0.6;

const PENALTY_LUMBAR = 0.05;
const PENALTY_VALGUS = 0.1;

/**
 * Angle at vertex `b` formed by a→b→c, in degrees.
 *
 * Uses the (x, y) projection: a phone camera gives a planar view, and the
 * depth channel from a single lens is too noisy to improve the result.
 */
export function calculateAngle(a: Point3D, b: Point3D, c: Point3D): number {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);

  if (angle > 180.0) {
    angle = 360.0 - angle;
  }
  return angle;
}

/**
 * Advance the squat state machine by one frame.
 *
 * Returns a new state; never mutates the one passed in.
 */
export function processSquatFrame(
  pose: Pose,
  currentState: BiomechanicsState,
): BiomechanicsState {
  // Skip frames where the body isn't clearly visible rather than feeding
  // garbage coordinates into the rep counter.
  if (!isPoseUsable(pose)) {
    return { ...currentState, issues: [] };
  }

  const nextState: BiomechanicsState = { ...currentState, issues: [] };

  // 1. Joint angles
  const hipAngle = calculateAngle(pose.leftShoulder, pose.leftHip, pose.leftKnee);
  const kneeAngle = calculateAngle(pose.leftHip, pose.leftKnee, pose.leftAnkle);

  const isStanding = kneeAngle > KNEE_STANDING;

  // 2. Rep counting state machine
  //
  // Depth gates the *rep*, not the phase transition. Tying the turnaround to
  // an absolute depth would make the shallow-rep warning unreachable: a rep
  // that had to pass the deep threshold to be counted is never shallow.
  switch (currentState.phase) {
    case 'standing':
      if (kneeAngle < KNEE_DESCENT_START && kneeAngle < currentState.lastKneeAngle) {
        nextState.phase = 'eccentric';
        nextState.deepestKneeAngle = kneeAngle;
      }
      break;

    case 'eccentric':
      nextState.deepestKneeAngle = Math.min(currentState.deepestKneeAngle, kneeAngle);
      // The bottom is wherever the knee starts extending again. The +2 margin
      // keeps sensor jitter from registering a false turnaround.
      if (kneeAngle > currentState.lastKneeAngle + 2) {
        nextState.phase = 'concentric';
      }
      break;

    case 'concentric':
      if (isStanding) {
        nextState.phase = 'standing';
        // Only a genuine dip counts; a small wobble does not.
        if (currentState.deepestKneeAngle <= KNEE_MIN_REP_DEPTH) {
          nextState.reps += 1;
          // Reported once, at the top, rather than on every frame.
          if (currentState.deepestKneeAngle > KNEE_DEPTH_TARGET) {
            nextState.issues.push('shallow_depth');
          }
        }
        nextState.deepestKneeAngle = 180;
      }
      break;
  }

  // 3. Injury prevention

  // Lumbar rounding: in a squat the torso hinges forward, but the hip angle
  // closing past this point means the back is folding rather than hinging.
  if (hipAngle < HIP_ROUNDING) {
    nextState.issues.push('lumbar_rounding');
    nextState.formScore = Math.max(0, nextState.formScore - PENALTY_LUMBAR);
  }

  // Knee valgus: knees collapsing inward relative to the ankles.
  const kneeSpread = Math.abs(pose.leftKnee.x - pose.rightKnee.x);
  const ankleSpread = Math.abs(pose.leftAnkle.x - pose.rightAnkle.x);
  const kneesVisible =
    (pose.rightKnee.visibility ?? 1) >= 0.3 && (pose.rightAnkle.visibility ?? 1) >= 0.3;

  if (kneesVisible && ankleSpread > 0 && !isStanding) {
    if (kneeSpread < ankleSpread * VALGUS_RATIO) {
      nextState.issues.push('knee_valgus');
      nextState.formScore = Math.max(0, nextState.formScore - PENALTY_VALGUS);
    }
  }

  // 4. Carry angles forward for the next frame's derivative
  nextState.lastHipAngle = hipAngle;
  nextState.lastKneeAngle = kneeAngle;

  return nextState;
}

/** Spanish copy for each issue the engine can raise. */
export const ISSUE_MESSAGES: Record<string, string> = {
  lumbar_rounding: '¡Cuidado con la espalda baja!',
  knee_valgus: '¡Evita que las rodillas colapsen!',
  shallow_depth: 'Baja más: no llegaste a paralelo',
};
