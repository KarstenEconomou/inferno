import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { SmoothClosedCurve } from "../src/track/smooth-curve";
import { course, frame, length, track, wrap } from "../src/track";
import { Vehicle } from "../src/sim";

describe("smooth road geometry", () => {
  it("passes through authored nodes with continuous curvature, including the lap seam", () => {
    const curve = new SmoothClosedCurve(
      track.nodes.map((p) => new Vector3(...p)),
    );
    const epsilon = 1e-7;
    for (let i = 0; i < track.nodes.length; i++) {
      const t = curve.nodeParameter(i);
      expect(
        curve.getPoint(t).distanceTo(new Vector3(...track.nodes[i])),
      ).toBeLessThan(1e-8);
      const tangent = curve.getTangent(t);
      const curvatureBefore = tangent
        .clone()
        .sub(curve.getTangent(t - epsilon))
        .divideScalar(
          curve.getPoint(t).distanceTo(curve.getPoint(t - epsilon)),
        );
      const curvatureAfter = curve
        .getTangent(t + epsilon)
        .sub(tangent)
        .divideScalar(
          curve.getPoint(t + epsilon).distanceTo(curve.getPoint(t)),
        );
      expect(
        curvatureBefore.distanceTo(curvatureAfter),
        `curvature at node ${i}`,
      ).toBeLessThan(0.0001);
    }
  });

  it("has continuous bank and grade response at authored blend boundaries", () => {
    const boundaries = [0, ...track.frameAnchors!.map((a) => a.t)];
    for (const zone of track.bankZones!)
      boundaries.push(
        zone.start,
        zone.start + zone.blend / length,
        zone.end - zone.blend / length,
        zone.end,
      );
    for (const [i, [a]] of track.gaps.entries())
      boundaries.push(a - track.jumpProfiles![i].rampLength! / length);
    const distance = 0.05,
      delta = distance / length;
    for (const t of boundaries) {
      if (track.gaps.some(([a, b]) => t > a - 1 / length && t < b + 1 / length))
        continue;
      const before = frame(t - delta),
        at = frame(t),
        after = frame(t + delta);
      for (const axis of ["forward", "up"] as const) {
        const rateBefore = at[axis]
          .clone()
          .sub(before[axis])
          .divideScalar(distance);
        const rateAfter = after[axis]
          .clone()
          .sub(at[axis])
          .divideScalar(distance);
        expect(
          rateBefore.distanceTo(rateAfter),
          `${axis} at ${t}`,
        ).toBeLessThan(0.001);
      }
    }
    expect(frame(0).up.y).toBeCloseTo(1, 10);
  });

  it("keeps quarter-metre orientation changes small through every bank and elevation transition", () => {
    const step = 0.25 / length;
    for (let t = 0; t < 1; t += step) {
      if (track.gaps.some(([a, b]) => t > a - 1 / length && t < b + 1 / length))
        continue;
      const a = frame(t),
        b = frame(t + step);
      expect(a.up.angleTo(b.up), `bank step at ${t}`).toBeLessThan(
        Math.PI / 180,
      );
      expect(a.forward.angleTo(b.forward), `curve step at ${t}`).toBeLessThan(
        Math.PI / 180,
      );
    }
  });

  it("preserves exact takeoff stations and upward momentum without a false lip landing", () => {
    for (const [index, [lip, landing]] of track.gaps.entries()) {
      expect(wrap(lip)).toBe(lip);
      expect(course.deckSegments.some((s) => s.b === lip)).toBe(true);
      for (const offset of [-3, 0, 3]) {
        const v = new Vehicle();
        v.reset(lip - 0.001);
        v.position.addScaledVector(frame(v.progress).right, offset);
        v.velocity.copy(v.heading).multiplyScalar(index ? 32 : 25);
        let airborne = false;
        for (let i = 0; i < 100 && !airborne; i++) {
          v.step({ throttle: 0, brake: false, steer: 0 });
          expect(v.landingAge).toBeGreaterThan(0);
          airborne = !v.grounded;
        }
        expect(airborne).toBe(true);
        expect(v.progress).toBeLessThan(landing);
        expect(v.velocity.y).toBeGreaterThan(3);
      }
    }
  });
});
