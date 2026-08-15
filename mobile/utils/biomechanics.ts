/**
 * BestMe — Biomechanics Engine
 * ==============================
 * Calculates joint kinematics and injury prevention alerts locally.
 * Designed to process MediaPipe landmarks (or any 3D keypoint array).
 */

export interface Point3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface BiomechanicsState {
  reps: number;
  phase: 'concentric' | 'eccentric' | 'standing';
  formScore: number;
  issues: string[];
  lastHipAngle: number;
  lastKneeAngle: number;
}

// MediaPipe standard indices (BlazePose 33-point topology)
export const LANDMARKS = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

/**
 * Calculates the angle formed by three 2D/3D points (a -> b -> c)
 * Returns the angle in degrees.
 */
export function calculateAngle(a: Point3D, b: Point3D, c: Point3D): number {
  // Using 2D projection (x, y) for robust planar angles in mobile camera view
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  
  if (angle > 180.0) {
    angle = 360.0 - angle;
  }
  return angle;
}

/**
 * Processes a single frame of landmarks for a Squat exercise.
 * Computes rep counting (concentric/eccentric transitions) and form alerts.
 */
export function processSquatFrame(
  landmarks: Point3D[],
  currentState: BiomechanicsState
): BiomechanicsState {
  const nextState = { ...currentState };
  nextState.issues = [];

  // Extract key points (assuming left side profile for simplicity, can average both)
  const shoulder = landmarks[LANDMARKS.LEFT_SHOULDER];
  const hip = landmarks[LANDMARKS.LEFT_HIP];
  const knee = landmarks[LANDMARKS.LEFT_KNEE];
  const ankle = landmarks[LANDMARKS.LEFT_ANKLE];

  // If keypoints aren't visible enough, skip frame (threshold 0.5)
  if (
    (shoulder.visibility ?? 1) < 0.5 ||
    (hip.visibility ?? 1) < 0.5 ||
    (knee.visibility ?? 1) < 0.5
  ) {
    return nextState;
  }

  // 1. Calculate main joints
  const hipAngle = calculateAngle(shoulder, hip, knee);
  const kneeAngle = calculateAngle(hip, knee, ankle);

  // 2. State Machine: Rep Counting & Phase Detection
  // Standing: Knee > 160
  // Deep Squat (Eccentric end): Knee < 90
  const isStanding = kneeAngle > 160;
  const isDeepSquat = kneeAngle < 90;

  if (currentState.phase === 'standing') {
    if (kneeAngle < 150 && kneeAngle < currentState.lastKneeAngle) {
      // Started descending
      nextState.phase = 'eccentric';
    }
  } else if (currentState.phase === 'eccentric') {
    if (isDeepSquat && kneeAngle > currentState.lastKneeAngle + 2) {
      // Started ascending (hit the bottom)
      nextState.phase = 'concentric';
    }
  } else if (currentState.phase === 'concentric') {
    if (isStanding) {
      // Completed the rep
      nextState.reps += 1;
      nextState.phase = 'standing';
    }
  }

  // 3. Injury Prevention Checks

  // Lumbar Rounding (Spinal Collapse): Hip angle should remain somewhat open in a squat 
  // If it closes too much (< 50 degrees), they might be folding their back over
  if (hipAngle < 50) {
    nextState.issues.push('lumbar_rounding');
    nextState.formScore = Math.max(0, nextState.formScore - 0.05);
  }

  // Knee Valgus (Knees caving in): Compare horizontal distance of knees vs ankles
  // Since we only have one side in this basic view, we check right vs left if available.
  const rKnee = landmarks[LANDMARKS.RIGHT_KNEE];
  const rAnkle = landmarks[LANDMARKS.RIGHT_ANKLE];
  
  if (rKnee && rAnkle) {
    const kneeDist = Math.abs(knee.x - rKnee.x);
    const ankleDist = Math.abs(ankle.x - rAnkle.x);
    // If knees are significantly closer together than ankles during eccentric/concentric phase
    if (!isStanding && kneeDist < ankleDist * 0.6) {
      nextState.issues.push('knee_valgus');
      nextState.formScore = Math.max(0, nextState.formScore - 0.1);
    }
  }

  // Save angles for next frame derivative
  nextState.lastHipAngle = hipAngle;
  nextState.lastKneeAngle = kneeAngle;

  return nextState;
}

/**
 * Generates a mock landmark frame for testing the Edge AI logic
 * Simulates a squat motion over time `t` (0 to 1)
 */
export function generateMockSquatFrame(t: number): Point3D[] {
  // t=0 is standing, t=0.5 is bottom of squat, t=1 is standing
  const depth = Math.sin(t * Math.PI); // 0 -> 1 -> 0

  const landmarks = new Array(33).fill({ x: 0, y: 0, z: 0, visibility: 0 });

  // Standing coordinates (normalized 0-1)
  // X is horizontal, Y is vertical down
  
  // Left side
  landmarks[LANDMARKS.LEFT_SHOULDER] = { x: 0.5, y: 0.2 + (depth * 0.3), z: 0, visibility: 0.9 };
  landmarks[LANDMARKS.LEFT_HIP] = { x: 0.5, y: 0.5 + (depth * 0.3), z: 0, visibility: 0.9 };
  // Knee moves forward in X during squat
  landmarks[LANDMARKS.LEFT_KNEE] = { x: 0.5 - (depth * 0.2), y: 0.7 + (depth * 0.1), z: 0, visibility: 0.9 };
  landmarks[LANDMARKS.LEFT_ANKLE] = { x: 0.5, y: 0.9, z: 0, visibility: 0.9 };

  // Right side (for valgus check)
  landmarks[LANDMARKS.RIGHT_SHOULDER] = { x: 0.6, y: 0.2 + (depth * 0.3), z: 0, visibility: 0.9 };
  landmarks[LANDMARKS.RIGHT_HIP] = { x: 0.6, y: 0.5 + (depth * 0.3), z: 0, visibility: 0.9 };
  
  // Introduce a slight knee valgus at the bottom (t=0.5) if we want to trigger it, 
  // let's keep knees normal for now.
  landmarks[LANDMARKS.RIGHT_KNEE] = { x: 0.6, y: 0.7 + (depth * 0.1), z: 0, visibility: 0.9 };
  landmarks[LANDMARKS.RIGHT_ANKLE] = { x: 0.6, y: 0.9, z: 0, visibility: 0.9 };

  return landmarks;
}
