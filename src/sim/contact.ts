import { HANDLING as H } from "./handling";
import { Box3, Ray, Vector3 } from "three";
import {
  frame,
  roadWidth,
  deckSegments,
  track,
  surface,
  length,
  inGap,
  onCourseChange,
  wrap,
} from "../track";

/** Collision surface of the road. It uses the same strip triangles and the
 * same gap rule as the rendered deck, raised by the ground clearance of the
 * car. Each test sweeps the full movement, not one end point of it. */
const buildStrips = () =>
  deckSegments.map(({ a, b }) => {
    const lanes = Math.ceil(track.width / 1.5);
    const corners = [a, b].flatMap((t) => {
      const f = frame(t);
      return Array.from(
        { length: lanes + 1 },
        (_, i) => -1 + (2 * i) / lanes,
      ).map((side) =>
        f.p
          .clone()
          .addScaledVector(f.right, (side * roadWidth(t)) / 2)
          .addScaledVector(f.up, H.clearance),
      );
    });
    const roadUp = frame((a + b) / 2).up;
    const triangles = Array.from({ length: lanes }, (_, i) => [
      [i, i + lanes + 1, i + 1],
      [i + 1, i + lanes + 1, i + lanes + 2],
    ])
      .flat()
      .map((indices) => {
        const [a, b, c] = indices.map((j) => corners[j]);
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        if (normal.dot(roadUp) < 0) normal.negate();
        return {
          a,
          b,
          c,
          normal,
          bounds: new Box3().setFromPoints([a, b, c]).expandByScalar(0.001),
        };
      });
    return {
      triangles,
      bounds: new Box3().setFromPoints(corners).expandByScalar(0.001),
    };
  });

/** Collision triangles of the selected course, built once and again after
 * a course change. */
let strips = buildStrips();
onCourseChange(() => {
  strips = buildStrips();
});
export function sweepDeck(start: Vector3, end: Vector3) {
  const motion = end.clone().sub(start),
    distance = motion.length();
  if (distance < 1e-9) return null;
  const ray = new Ray(start, motion.divideScalar(distance));
  const bounds = new Box3().setFromPoints([start, end]).expandByScalar(0.001);
  let closest = distance + 1e-7;
  let hit: { position: Vector3; normal: Vector3; fraction: number } | null =
    null;
  const point = new Vector3();
  for (const strip of strips) {
    if (!bounds.intersectsBox(strip.bounds)) continue;
    for (const triangle of strip.triangles) {
      if (
        !bounds.intersectsBox(triangle.bounds) ||
        ray.direction.dot(triangle.normal) >= -1e-8
      )
        continue;
      if (
        !ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, point)
      )
        continue;
      const d = start.distanceTo(point);
      if (d <= closest) {
        closest = d;
        hit = {
          position: point.clone(),
          normal: triangle.normal,
          fraction: Math.min(1, d / distance),
        };
      }
    }
  }
  return hit;
}

/** The four wheel positions, in the order front left, front right, rear left
 * and rear right. They use the same wheelbase and track as the car model. */
export function wheelOffsets(heading: Vector3, up: Vector3) {
  const right = heading.clone().cross(up).normalize();
  return [H.wheelFront, -H.wheelRear].flatMap((along) =>
    [-1, 1].map((side) =>
      heading
        .clone()
        .multiplyScalar(along)
        .addScaledVector(right, side * H.wheelHalfWidth),
    ),
  );
}
export type WheelSupport = ReturnType<typeof probeWheels>;
export function probeWheels(
  position: Vector3,
  heading: Vector3,
  up: Vector3,
  progress: number,
) {
  let mask = 0;
  const compression: number[] = [];
  const normal = new Vector3();
  let height = 0,
    count = 0;
  wheelOffsets(heading, up).forEach((offset, i) => {
    const point = position.clone().add(offset);
    let t = progress;
    // Project onto the road with Newton iteration. The search stays on this
    // branch and cannot move to the other level of a crossing.
    for (let j = 0; j < 3; j++) {
      const f = frame(t);
      t = wrap(t + point.clone().sub(f.p).dot(f.forward) / length);
    }
    const f = frame(t),
      delta = point.clone().sub(f.p);
    const lateral = delta.dot(f.right),
      h = delta.dot(f.up);
    const n = surface(t, lateral, f).normal;
    const supported =
      !inGap(t) &&
      Math.abs(lateral) <= roadWidth(t) / 2 &&
      up.dot(n) >= H.landingAlignment &&
      h >= H.clearance - H.suspensionTravel &&
      h <= H.clearance + H.suspensionTravel;
    compression[i] = supported
      ? Math.max(
          0,
          Math.min(
            1,
            (H.clearance + H.suspensionRest - h) / H.suspensionTravel,
          ),
        )
      : 0;
    if (supported) {
      mask |= 1 << i;
      normal.add(n);
      height += H.clearance - h;
      count++;
    }
  });
  if (count) normal.normalize();
  return {
    mask,
    compression,
    normal,
    correction: count ? height / count : 0,
    front: (mask & 1 ? 0.25 : 0) + (mask & 2 ? 0.25 : 0),
    rear: (mask & 4 ? 0.25 : 0) + (mask & 8 ? 0.25 : 0),
  };
}

export function sweepWheels(
  start: Vector3,
  end: Vector3,
  heading: Vector3,
  up: Vector3,
) {
  let first:
    | (NonNullable<ReturnType<typeof sweepDeck>> & {
        wheel: number;
        anchor: Vector3;
      })
    | null = null;
  for (const [wheel, offset] of wheelOffsets(heading, up).entries()) {
    const hit = sweepDeck(start.clone().add(offset), end.clone().add(offset));
    if (
      hit &&
      up.dot(hit.normal) >= H.landingAlignment &&
      (!first || hit.fraction < first.fraction)
    )
      first = {
        ...hit,
        wheel,
        anchor: hit.position.clone(),
        position: hit.position.sub(offset),
      };
  }
  return first;
}
