/**
 * BestMe — Pose Topologies
 * ==========================
 * Normalizes the different keypoint layouts pose models emit into one
 * named-joint shape, so the biomechanics maths never has to know which
 * model produced the frame.
 *
 * The two layouts differ in both count and ordering:
 *
 *   BlazePose (MediaPipe) — 33 points, left hip at index 23
 *   MoveNet   (COCO)      — 17 points, left hip at index 11
 *
 * Indexing one with the other's constants silently reads the wrong body
 * part: `landmarks[23]` is the left hip under BlazePose but does not exist
 * under MoveNet. Hence this layer.
 */

export interface Point3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** A frame reduced to the joints the squat analysis actually needs. */
export interface Pose {
  leftShoulder: Point3D;
  rightShoulder: Point3D;
  leftHip: Point3D;
  rightHip: Point3D;
  leftKnee: Point3D;
  rightKnee: Point3D;
  leftAnkle: Point3D;
  rightAnkle: Point3D;
}

/** BlazePose / MediaPipe 33-point topology. */
export const BLAZEPOSE_INDICES = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

/** MoveNet / COCO 17-point topology. */
export const MOVENET_INDICES = {
  leftShoulder: 5,
  rightShoulder: 6,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16,
} as const;

const EMPTY_POINT: Point3D = { x: 0, y: 0, z: 0, visibility: 0 };

function pick(landmarks: Point3D[], index: number): Point3D {
  return landmarks[index] ?? EMPTY_POINT;
}

function buildPose(
  landmarks: Point3D[],
  indices: Record<keyof Pose, number>,
): Pose {
  return {
    leftShoulder: pick(landmarks, indices.leftShoulder),
    rightShoulder: pick(landmarks, indices.rightShoulder),
    leftHip: pick(landmarks, indices.leftHip),
    rightHip: pick(landmarks, indices.rightHip),
    leftKnee: pick(landmarks, indices.leftKnee),
    rightKnee: pick(landmarks, indices.rightKnee),
    leftAnkle: pick(landmarks, indices.leftAnkle),
    rightAnkle: pick(landmarks, indices.rightAnkle),
  };
}

/** Build a Pose from a MediaPipe BlazePose frame (33 landmarks). */
export function fromBlazePose(landmarks: Point3D[]): Pose {
  return buildPose(landmarks, BLAZEPOSE_INDICES);
}

/** Build a Pose from a MoveNet frame (17 COCO keypoints). */
export function fromMoveNet(keypoints: Point3D[]): Pose {
  return buildPose(keypoints, MOVENET_INDICES);
}

/**
 * MoveNet's raw output is a flat Float32Array of [y, x, score] triplets in
 * normalized coordinates — not an array of objects. This converts one
 * inference result into keypoints.
 *
 * Note the ordering: MoveNet emits **y before x**. Swapping them is the
 * classic integration bug; it produces angles that look plausible but are
 * reflected about the diagonal.
 */
export function decodeMoveNetOutput(output: ArrayLike<number>): Point3D[] {
  const keypoints: Point3D[] = [];
  for (let i = 0; i < 17; i += 1) {
    const offset = i * 3;
    keypoints.push({
      y: output[offset] ?? 0,
      x: output[offset + 1] ?? 0,
      z: 0,
      visibility: output[offset + 2] ?? 0,
    });
  }
  return keypoints;
}

/** Whether the joints the squat analysis needs are visible enough to trust. */
export function isPoseUsable(pose: Pose, threshold = 0.3): boolean {
  const required: (keyof Pose)[] = ['leftShoulder', 'leftHip', 'leftKnee', 'leftAnkle'];
  return required.every((joint) => (pose[joint].visibility ?? 1) >= threshold);
}
