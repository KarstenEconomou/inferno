import { CatmullRomCurve3, Quaternion, Vector3 } from "three";
import type { TrackDefinition } from "./definition";
import { elevation } from "./layout";
import { SmoothClosedCurve } from "./smooth-curve";
import { validateTrack } from "./validate";
export type {
  JumpSettings,
  LaneMark,
  LaneSettings,
  TrackDefinition,
} from "./definition";

/** Position, direction and roll of the road at one station. */
export type RoadFrame = {
  p: Vector3;
  forward: Vector3;
  right: Vector3;
  up: Vector3;
  bank: number;
};

/** Road frame at a point, plus where that point is relative to the road. */
export type RoadContact = ReturnType<
  ReturnType<typeof createTrack>["frame"]
> & { t: number; lateral: number; height: number };

/** Compile a course definition into the geometry that the simulation, the
 * renderer and the interface all share. */
export function createTrack(track: TrackDefinition) {
  const { jumps, banking } = validateTrack(track);
  const points = track.nodes.map(([x, y, z]) => new Vector3(x, y, z));
  const curve =
    track.curveType === "smooth"
      ? new SmoothClosedCurve(points)
      : new CatmullRomCurve3(
          points,
          true,
          track.curveType ?? "catmullrom",
          track.tension ?? 0.4,
        );
  curve.arcLengthDivisions = 32000;
  const length = curve.getLength();
  // Keep an exact station that is already in range. Modulo arithmetic can
  // move a launch lip to the other side of its edge by one unit in the last
  // place.
  const wrap = (t: number) => (t >= 0 && t < 1 ? t : t - Math.floor(t));
  function point(t: number) {
    const p = curve.getPointAt(wrap(t));
    if (track.startPlatform) {
      const distance = Math.min(wrap(t), 1 - wrap(t)) * length;
      const { halfLength, blendLength } = track.startPlatform;
      p.y =
        points[0].y +
        (p.y - points[0].y) * smooth((distance - halfLength) / blendLength);
    }
    track.gaps.forEach(([start], i) => {
      const d = (start - wrap(t)) * length,
        profile = jumps[i];
      if (d >= 0 && d < profile.rampLength) {
        const u = 1 - d / profile.rampLength;
        // The ramp adds no slope and no curvature at its entry. At the
        // takeoff edge it keeps the authored height and launch slope.
        p.y += profile.rampHeight * u * u * u * (2 - u);
      }
    });
    return p;
  }
  function roadWidth(t: number) {
    let width = track.width;
    for (const zone of track.widthZones ?? []) {
      const progress = wrap(t);
      if (progress < zone.start || progress > zone.end) continue;
      const edge =
        Math.min(progress - zone.start, zone.end - progress) * length;
      const blend = Math.min(1, edge / zone.blend);
      width = Math.max(
        width,
        track.width + (zone.width - track.width) * smooth(blend),
      );
    }
    track.gaps.forEach(([a, b], i) => {
      const d = Math.abs(wrap(t) - (a + b) / 2) * length,
        profile = jumps[i];
      width = Math.max(
        width,
        track.width + profile.extraWidth * smooth(1 - d / profile.widthBlend),
      );
    });
    return width;
  }
  // The painted lane. A course without one is paved from edge to edge: the
  // lane covers the whole corridor and every surface query returns full grip.
  const laneMarks = track.lane?.marks ?? [];
  const laneOffset = laneMarks.length
    ? elevation(
        laneMarks.map((m) => ({ at: m.at * length, y: m.offset })),
        length,
      )
    : null;
  const laneHalfWidth = laneMarks.length
    ? elevation(
        laneMarks.map((m) => ({ at: m.at * length, y: m.halfWidth })),
        length,
      )
    : null;
  /** Centre and half-width of the paint at a station, in metres. */
  function lane(t: number) {
    const progress = wrap(t);
    if (!laneOffset || !laneHalfWidth)
      return { offset: 0, halfWidth: roadWidth(progress) / 2 };
    return {
      offset: laneOffset(progress * length),
      halfWidth: laneHalfWidth(progress * length),
    };
  }
  /** How much of the tire is on the paint, from 0 on open terrain to 1. */
  function paved(t: number, lateral: number) {
    if (!laneOffset) return 1;
    const { offset, halfWidth } = lane(t);
    const blend = track.lane?.blend ?? 1.5;
    return smooth((halfWidth - Math.abs(lateral - offset)) / blend);
  }
  /** Cornering grip at a point on the surface, as a fraction of the paved
   * value. It is a property of the course, and never of the moment. */
  const surfaceGrip = (t: number, lateral: number) =>
    laneOffset
      ? (track.lane?.grip ?? 1) +
        (1 - (track.lane?.grip ?? 1)) * paved(t, lateral)
      : 1;
  /** Extra rolling deceleration off the paint, in metres per second squared. */
  const surfaceDrag = (t: number, lateral: number) =>
    laneOffset ? (track.lane?.drag ?? 0) * (1 - paved(t, lateral)) : 0;

  // The bank angle comes from the curvature of the centreline. The filter
  // works in metres, so the spacing of the nodes does not change the result.
  // A wide kernel removes ripples that are as short as a steering movement.
  const bankCount = 4096;
  const rawBank = (t: number) => {
    const ahead = curve.getTangentAt(wrap(t + 0.007));
    const behind = curve.getTangentAt(wrap(t - 0.007));
    const turn = behind.x * ahead.z - behind.z * ahead.x;
    return Math.max(
      -banking.max,
      Math.min(banking.max, turn * banking.strength),
    );
  };
  const rawValues = Array.from({ length: bankCount }, (_, i) =>
    rawBank(i / bankCount),
  );
  const bankRadius = Math.ceil((24 * bankCount) / length);
  const bankValues = rawValues.map((_, i) => {
    let sum = 0,
      weight = 0;
    for (let j = -bankRadius; j <= bankRadius; j++) {
      const metres = (j * length) / bankCount;
      const w = Math.exp(-0.5 * (metres / 8) ** 2);
      sum += rawValues[(i + j + bankCount) % bankCount] * w;
      weight += w;
    }
    return sum / weight;
  });
  const smooth = (x: number) => {
    const u = Math.max(0, Math.min(1, x));
    return u * u * u * (u * (u * 6 - 15) + 10);
  };
  function tangent(t: number) {
    // Never take a difference across the missing deck at a launch lip.
    let before = t - 0.00004,
      after = t + 0.00004;
    const progress = wrap(t);
    for (const [lip] of track.gaps) {
      if (progress <= lip && progress + 0.00004 > lip) after = t;
      if (progress > lip && progress - 0.00004 <= lip) before = t;
    }
    return point(after).sub(point(before)).normalize();
  }
  // A rotation-minimising frame stays correct through a vertical tangent and
  // through upside-down travel. A cross product with world up cannot do
  // either. The residual twist of the lap spreads along the course, so the
  // closed loop has no seam in its orientation.
  const frameCount = 8192;
  const transport: { forward: Vector3; right: Vector3 }[] = [];
  const initial = tangent(0);
  let right = new Vector3().crossVectors(initial, new Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-8)
    right.crossVectors(initial, new Vector3(0, 0, 1));
  right.normalize();
  let previous = initial;
  const rotation = new Quaternion();
  for (let i = 0; i <= frameCount; i++) {
    const forward = tangent(i / frameCount);
    right = right
      .clone()
      .applyQuaternion(rotation.setFromUnitVectors(previous, forward));
    right.addScaledVector(forward, -right.dot(forward)).normalize();
    transport.push({ forward, right });
    previous = forward;
  }
  const endRight = transport[frameCount].right;
  const closure = Math.atan2(
    endRight.clone().cross(transport[0].right).dot(initial),
    endRight.dot(transport[0].right),
  );
  const anchorAngles = (track.frameAnchors ?? []).map((anchor) => {
    const index = Math.min(frameCount, Math.floor(anchor.t * frameCount));
    const basis = transport[index];
    const desired = basis.forward
      .clone()
      .cross(new Vector3(...anchor.up))
      .normalize();
    return {
      t: anchor.t,
      angle: Math.atan2(
        basis.right.clone().cross(desired).dot(basis.forward),
        basis.right.dot(desired),
      ),
    };
  });
  for (let i = 1; i < anchorAngles.length; i++) {
    while (anchorAngles[i].angle - anchorAngles[i - 1].angle > Math.PI)
      anchorAngles[i].angle -= Math.PI * 2;
    while (anchorAngles[i].angle - anchorAngles[i - 1].angle < -Math.PI)
      anchorAngles[i].angle += Math.PI * 2;
  }
  function frameCorrection(t: number) {
    if (!anchorAngles.length) return closure * t;
    const i = Math.max(0, anchorAngles.findIndex((a) => a.t > t) - 1);
    const a = anchorAngles[i],
      b = anchorAngles[i + 1] ?? a;
    return a.angle + (b.angle - a.angle) * smooth((t - a.t) / (b.t - a.t || 1));
  }
  function frame(t: number) {
    const progress = wrap(t),
      p = point(t),
      forward = tangent(t);
    const index = Math.floor(progress * frameCount);
    const right = transport[index].right
      .clone()
      .applyQuaternion(
        new Quaternion().setFromUnitVectors(transport[index].forward, forward),
      )
      .applyAxisAngle(forward, frameCorrection(progress));
    const bankPosition = wrap(t) * bankCount;
    const bankIndex = Math.floor(bankPosition);
    const mix = bankPosition - bankIndex;
    // A cubic B-spline lookup is continuous in its second derivative across
    // the table samples. Linear interpolation is not.
    const bankAt = (offset: number) =>
      bankValues[(bankIndex + offset + bankCount) % bankCount];
    let bank =
      (bankAt(-1) * (1 - mix) ** 3 +
        bankAt(0) * (3 * mix ** 3 - 6 * mix ** 2 + 4) +
        bankAt(1) * (-3 * mix ** 3 + 3 * mix ** 2 + 3 * mix + 1) +
        bankAt(2) * mix ** 3) /
      6;
    for (const [a, b] of track.gaps)
      bank *= smooth((Math.abs(wrap(t) - (a + b) / 2) * length - 35) / 65);
    bank *= smooth((Math.min(wrap(t), 1 - wrap(t)) * length) / 75);
    for (const zone of track.bankZones ?? []) {
      if (progress < zone.start || progress > zone.end) continue;
      const edge =
        Math.min(progress - zone.start, zone.end - progress) * length;
      const blend = zone.blend > 0 ? smooth(edge / zone.blend) : 1;
      bank += (zone.angle - bank) * blend;
    }
    for (const roll of track.rolls ?? []) {
      const u = Math.max(
        0,
        Math.min(1, (progress - roll.start) / (roll.end - roll.start)),
      );
      bank += roll.turns * Math.PI * 2 * (u * u * u * (u * (u * 6 - 15) + 10));
    }
    right.applyAxisAngle(forward, bank);
    const up = new Vector3().crossVectors(right, forward).normalize();
    return { p, forward, right, up, bank };
  }
  const inGap = (t: number) =>
    track.gaps.some(([a, b]) => wrap(t) >= a && wrap(t) < b);
  const samples = Array.from({ length: track.resolution ?? 1200 }, (_, i) => ({
    ...frame(i / (track.resolution ?? 1200)),
    t: i / (track.resolution ?? 1200),
    gap: inGap(i / (track.resolution ?? 1200)),
  }));
  // The renderer and the swept collision share these fine deck segments. The
  // cheaper navigation samples above are separate. The list includes the exact
  // lip stations, so no segment crosses the edge of a gap.
  const deckCount = Math.ceil(length / 0.5);
  const deckBreaks = [
    ...new Set([
      ...Array.from({ length: deckCount + 1 }, (_, i) => i / deckCount),
      ...track.gaps.flat(),
    ]),
  ].sort((a, b) => a - b);
  const deckSegments = deckBreaks.slice(0, -1).flatMap((a, i) => {
    const b = deckBreaks[i + 1];
    return inGap((a + b) / 2) ? [] : [{ a, b }];
  });
  /** Road surface at a lateral offset. Pass `known` when the caller already
   * holds the frame at `t`; the result is the same either way. */
  function surface(t: number, lateral = 0, known?: RoadFrame) {
    const f = known ?? frame(t);
    if (Math.abs(lateral) < 1e-8) return { ...f, normal: f.up.clone() };
    if (
      track.gaps.some(
        ([a, b]) => Math.min(Math.abs(t - a), Math.abs(t - b)) * length < 0.5,
      )
    )
      return { ...f, normal: f.up.clone() };
    const e = 0.2 / length;
    const a = frame(t - e),
      b = frame(t + e);
    const along = b.p
      .addScaledVector(b.right, lateral)
      .sub(a.p.addScaledVector(a.right, lateral))
      .normalize();
    // At the edge of a twisted ribbon the normal differs from the normal of
    // the centreline. This follows the real road through a change of bank.
    const normal = f.right.clone().cross(along).normalize();
    if (normal.dot(f.up) < 0) normal.negate();
    return { ...f, normal };
  }
  function nearest(p: Vector3, hint?: number): RoadContact {
    let best = samples[0],
      dist = Infinity;
    for (const f of samples) {
      const arc =
        hint === undefined
          ? 0
          : Math.abs(wrap(f.t - hint + 0.5) - 0.5) * length;
      // A sample near the hint wins while the car is within a few car lengths
      // of it. A distant sample can still win, so a jump between the two
      // levels of a crossing is possible.
      const d = f.p.distanceToSquared(p) + (arc > 80 ? 100 : 0);
      if (d < dist) {
        dist = d;
        best = f;
      }
    }
    const along = p.clone().sub(best.p).dot(best.forward);
    const f = frame(best.t + along / length);
    const delta = p.clone().sub(f.p);
    return {
      ...f,
      t: wrap(best.t + along / length),
      lateral: delta.dot(f.right),
      height: delta.dot(f.up),
    };
  }

  return {
    track,
    length,
    wrap,
    point,
    roadWidth,
    lane,
    paved,
    surfaceGrip,
    surfaceDrag,
    frame,
    surface,
    inGap,
    samples,
    deckSegments,
    nearest,
  };
}
