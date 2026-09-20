import { describe, expect, it } from "vitest";
import { frame, roadWidth, track } from "../src/track";
import { sweepDeck } from "../src/sim/contact";

describe("swept road contact", () => {
  it("finds a crossing even when both motion endpoints are outside the road", () => {
    const f = frame(0.32),
      half = roadWidth(0.32) / 2;
    const start = f.p
      .clone()
      .addScaledVector(f.right, half + 4)
      .addScaledVector(f.up, 5);
    const end = f.p
      .clone()
      .addScaledVector(f.right, -half - 4)
      .addScaledVector(f.up, -4);
    const hit = sweepDeck(start, end);
    expect(hit).not.toBeNull();
    expect(hit!.fraction).toBeGreaterThan(0.3);
    expect(hit!.fraction).toBeLessThan(0.7);
    expect(
      hit!.position.distanceTo(start.clone().lerp(end, hit!.fraction)),
    ).toBeLessThan(1e-6);
  });
  it("does not manufacture ground over a gap or catch a car from underneath", () => {
    const gap = frame((track.gaps[0][0] + track.gaps[0][1]) / 2);
    expect(
      sweepDeck(
        gap.p.clone().addScaledVector(gap.up, 5),
        gap.p.clone().addScaledVector(gap.up, -5),
      ),
    ).toBeNull();
    const f = frame(0.32);
    expect(
      sweepDeck(
        f.p.clone().addScaledVector(f.up, -3),
        f.p.clone().addScaledVector(f.up, 3),
      ),
    ).toBeNull();
  });
});

import { probeWheels } from "../src/sim/contact";
import { Vehicle } from "../src/sim";
it("reports four wheels, individual suspension and front/rear support at the lip", () => {
  const v = new Vehicle();
  const full = probeWheels(v.position, v.heading, v.up, 0);
  expect(full.mask).toBe(15);
  expect(full.front).toBe(0.5);
  expect(full.rear).toBe(0.5);
  expect(full.compression.every((c) => c > 0 && c < 1)).toBe(true);
  v.reset(track.gaps[0][0]);
  const partial = probeWheels(v.position, v.heading, v.up, v.progress);
  expect(partial.mask).toBe(12);
  expect(partial.front).toBe(0);
  expect(partial.rear).toBe(0.5);
  v.up.negate();
  expect(probeWheels(v.position, v.heading, v.up, v.progress).mask).toBe(0);
});
it("lands on rear wheels at a launch edge, then releases the remaining support", () => {
  const v = new Vehicle();
  v.reset(track.gaps[0][0]);
  v.position.addScaledVector(v.up, 0.2);
  v.velocity.copy(v.up).multiplyScalar(-40);
  v.grounded = false;
  v.step({ throttle: 1, brake: false, steer: 0 });
  expect(v.grounded).toBe(true);
  expect(v.contactMask).toBe(12);
  v.velocity.copy(v.heading).multiplyScalar(70);
  let partial = false;
  for (let i = 0; i < 20 && v.grounded; i++) {
    v.step({ throttle: 1, brake: false, steer: 0 });
    partial ||= v.contactMask === 12;
  }
  expect(partial).toBe(true);
  expect(v.grounded).toBe(false);
  expect(v.contactMask).toBe(0);
  expect(v.frontLoad + v.rearLoad).toBe(0);
});
