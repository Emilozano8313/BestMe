/**
 * Tests for the on-device biomechanics engine.
 *
 * Run with:  npm test
 *
 * These matter because the engine is what counts your reps and warns you
 * about knee valgus — if it silently reads the wrong joint, it produces
 * confident numbers that are simply wrong.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INITIAL_STATE,
  type BiomechanicsState,
  calculateAngle,
  processSquatFrame,
} from '../biomechanics';
import {
  BLAZEPOSE_INDICES,
  MOVENET_INDICES,
  type Point3D,
  type Pose,
  decodeMoveNetOutput,
  fromBlazePose,
  fromMoveNet,
  isPoseUsable,
} from '../pose';

// ── Helpers ──────────────────────────────────────────────────────

const pt = (x: number, y: number, visibility = 0.9): Point3D => ({
  x,
  y,
  z: 0,
  visibility,
});

/**
 * Build a pose at a given squat depth.
 * depth 0 = standing upright, depth 1 = deep squat.
 */
function squatPose(depth: number, opts: { valgus?: boolean } = {}): Pose {
  const kneeInset = opts.valgus ? 0.06 : 0;
  return {
    leftShoulder: pt(0.5, 0.2 + depth * 0.28),
    rightShoulder: pt(0.6, 0.2 + depth * 0.28),
    leftHip: pt(0.5, 0.5 + depth * 0.28),
    rightHip: pt(0.6, 0.5 + depth * 0.28),
    // Knees travel forward and down as depth increases.
    leftKnee: pt(0.5 - depth * 0.18 + kneeInset, 0.7 + depth * 0.06),
    rightKnee: pt(0.6 - kneeInset, 0.7 + depth * 0.06),
    leftAnkle: pt(0.5, 0.9),
    rightAnkle: pt(0.6, 0.9),
  };
}

/** Drive the state machine through a full descent and ascent. */
function performRep(
  state: BiomechanicsState,
  opts: { maxDepth?: number; valgus?: boolean } = {},
): BiomechanicsState {
  const maxDepth = opts.maxDepth ?? 1;
  let next = state;
  for (let d = 0; d <= maxDepth; d += 0.05) {
    next = processSquatFrame(squatPose(d, opts), next);
  }
  for (let d = maxDepth; d >= 0; d -= 0.05) {
    next = processSquatFrame(squatPose(d, opts), next);
  }
  return next;
}

// ── Angle maths ──────────────────────────────────────────────────

describe('calculateAngle', () => {
  it('returns 180 degrees for three collinear points', () => {
    const angle = calculateAngle(pt(0, 0), pt(1, 0), pt(2, 0));
    assert.equal(Math.round(angle), 180);
  });

  it('returns 90 degrees for a right angle', () => {
    const angle = calculateAngle(pt(0, 0), pt(1, 0), pt(1, 1));
    assert.equal(Math.round(angle), 90);
  });

  it('never exceeds 180 degrees', () => {
    for (let i = 0; i < 360; i += 10) {
      const rad = (i * Math.PI) / 180;
      const angle = calculateAngle(
        pt(0, 0),
        pt(1, 0),
        pt(1 + Math.cos(rad), Math.sin(rad)),
      );
      assert.ok(angle >= 0 && angle <= 180, `${i}deg produjo ${angle}`);
    }
  });
});

// ── Topology adapters ────────────────────────────────────────────

describe('pose adapters', () => {
  it('reads the same anatomy from both topologies', () => {
    // BlazePose: 33 points; MoveNet: 17. The same physical joint sits at a
    // different index in each, which is the whole reason this layer exists.
    const blaze: Point3D[] = Array.from({ length: 33 }, () => pt(0, 0, 0));
    blaze[BLAZEPOSE_INDICES.leftHip] = pt(0.5, 0.55);
    blaze[BLAZEPOSE_INDICES.leftKnee] = pt(0.45, 0.72);

    const movenet: Point3D[] = Array.from({ length: 17 }, () => pt(0, 0, 0));
    movenet[MOVENET_INDICES.leftHip] = pt(0.5, 0.55);
    movenet[MOVENET_INDICES.leftKnee] = pt(0.45, 0.72);

    const a = fromBlazePose(blaze);
    const b = fromMoveNet(movenet);

    assert.deepEqual(a.leftHip, b.leftHip);
    assert.deepEqual(a.leftKnee, b.leftKnee);
  });

  it('does not crash on a short or empty keypoint array', () => {
    const pose = fromMoveNet([]);
    assert.equal(pose.leftHip.visibility, 0);
    assert.equal(isPoseUsable(pose), false);
  });

  it('decodes MoveNet output as [y, x, score], not [x, y, score]', () => {
    // Getting this backwards yields angles that look plausible but are
    // mirrored about the diagonal — a silent, hard-to-spot failure.
    const raw = new Float32Array(51);
    raw[MOVENET_INDICES.leftHip * 3] = 0.55; // y
    raw[MOVENET_INDICES.leftHip * 3 + 1] = 0.5; // x
    raw[MOVENET_INDICES.leftHip * 3 + 2] = 0.92; // score

    const keypoints = decodeMoveNetOutput(raw);
    const hip = keypoints[MOVENET_INDICES.leftHip];

    // Float32 rounds, so compare with a tolerance rather than exactly.
    const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    assert.ok(close(hip.y, 0.55), `y=${hip.y}`);
    assert.ok(close(hip.x, 0.5), `x=${hip.x}`);
    assert.ok(close(hip.visibility ?? 0, 0.92), `score=${hip.visibility}`);
  });

  it('treats a pose with low-visibility joints as unusable', () => {
    const pose = squatPose(0);
    pose.leftKnee = pt(0.4, 0.7, 0.1);
    assert.equal(isPoseUsable(pose), false);
  });
});

// ── Rep counting ─────────────────────────────────────────────────

describe('rep counting', () => {
  it('counts exactly one rep per descent and ascent', () => {
    const after = performRep(INITIAL_STATE);
    assert.equal(after.reps, 1);
    assert.equal(after.phase, 'standing');
  });

  it('counts five reps for five squats', () => {
    let state = INITIAL_STATE;
    for (let i = 0; i < 5; i += 1) state = performRep(state);
    assert.equal(state.reps, 5);
  });

  it('does not count a rep while standing still', () => {
    let state = INITIAL_STATE;
    for (let i = 0; i < 60; i += 1) {
      state = processSquatFrame(squatPose(0), state);
    }
    assert.equal(state.reps, 0);
  });

  it('does not count a rep for a shallow dip that never reaches depth', () => {
    const after = performRep(INITIAL_STATE, { maxDepth: 0.25 });
    assert.equal(after.reps, 0);
  });

  it('ignores frames where the body is not visible', () => {
    const invisible: Pose = squatPose(0.5);
    invisible.leftHip = pt(0.5, 0.6, 0);
    const after = processSquatFrame(invisible, INITIAL_STATE);
    assert.deepEqual(after.reps, INITIAL_STATE.reps);
  });
});

// ── Injury prevention ────────────────────────────────────────────

describe('injury prevention', () => {
  it('flags knee valgus and lowers the form score', () => {
    const after = performRep(INITIAL_STATE, { valgus: true });
    const clean = performRep(INITIAL_STATE);

    assert.ok(
      after.formScore < clean.formScore,
      'una sentadilla con valgo debe puntuar peor que una limpia',
    );
  });

  it('does not flag valgus on a clean rep', () => {
    let state = INITIAL_STATE;
    const seen: string[] = [];
    for (let d = 0; d <= 1; d += 0.05) {
      state = processSquatFrame(squatPose(d), state);
      seen.push(...state.issues);
    }
    assert.ok(!seen.includes('knee_valgus'));
  });

  it('flags a rep that counts but never reaches parallel', () => {
    // A half squat: deep enough to register, short of parallel. This is the
    // case that used to be unreachable, because the phase transition itself
    // demanded more depth than the warning threshold.
    let state = INITIAL_STATE;
    const seen: string[] = [];
    for (let d = 0; d <= 0.4; d += 0.02) {
      state = processSquatFrame(squatPose(d), state);
      seen.push(...state.issues);
    }
    for (let d = 0.4; d >= 0; d -= 0.02) {
      state = processSquatFrame(squatPose(d), state);
      seen.push(...state.issues);
    }

    assert.equal(state.reps, 1, 'media sentadilla debería contar como repetición');
    assert.ok(seen.includes('shallow_depth'), 'debería avisar de poca profundidad');
  });

  it('does not flag a full-depth rep as shallow', () => {
    let state = INITIAL_STATE;
    const seen: string[] = [];
    for (let d = 0; d <= 1; d += 0.05) {
      state = processSquatFrame(squatPose(d), state);
      seen.push(...state.issues);
    }
    for (let d = 1; d >= 0; d -= 0.05) {
      state = processSquatFrame(squatPose(d), state);
      seen.push(...state.issues);
    }

    assert.equal(state.reps, 1);
    assert.ok(!seen.includes('shallow_depth'));
  });

  it('keeps the form score within 0..1', () => {
    let state = INITIAL_STATE;
    for (let i = 0; i < 30; i += 1) state = performRep(state, { valgus: true });
    assert.ok(state.formScore >= 0 && state.formScore <= 1, `score=${state.formScore}`);
  });

  it('never mutates the state it was given', () => {
    const original = { ...INITIAL_STATE };
    processSquatFrame(squatPose(0.5), INITIAL_STATE);
    assert.deepEqual(INITIAL_STATE, original);
  });
});
