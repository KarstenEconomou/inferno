import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { Vehicle, STEP } from "../src/sim";
import { frame, track } from "../src/track";
const coast = { throttle: 1, steer: 0, brake: false };
function flying() {
  const v = new Vehicle();
  v.position.y += 100;
  v.grounded = false;
  v.velocity.copy(v.heading).multiplyScalar(45);
  return v;
}
describe("Stadium-style airborne controls", () => {
  it.each([-1, 0, 1])(
    "cannot power a rotation from rest with steering %s",
    (steer) => {
      const v = flying(),
        neutral = flying();
      for (let i = 0; i < 60; i++) {
        v.step({ ...coast, steer });
        neutral.step(coast);
      }
      expect(v.heading.distanceTo(neutral.heading)).toBe(0);
      expect(v.up.distanceTo(neutral.up)).toBe(0);
      expect(v.angularVelocity.length()).toBe(0);
      expect(v.position.distanceTo(neutral.position)).toBe(0);
    },
  );
  it("arrests pitch in one tick at the current attitude without changing trajectory", () => {
    const a = flying(),
      b = flying();
    const right = a.heading.clone().cross(a.up);
    for (const v of [a, b]) {
      v.heading.applyAxisAngle(right, 0.6);
      v.up.applyAxisAngle(right, 0.6);
      v.angularVelocity.copy(right).multiplyScalar(2);
    }
    const h = a.heading.clone(),
      u = a.up.clone();
    a.step({ ...coast, brake: true });
    b.step(coast);
    expect(a.angularVelocity.length()).toBeLessThan(1e-10);
    expect(a.heading.distanceTo(h)).toBeLessThan(1e-10);
    expect(a.up.distanceTo(u)).toBeLessThan(1e-10);
    expect(a.position.distanceTo(b.position)).toBe(0);
    expect(a.velocity.distanceTo(b.velocity)).toBe(0);
    for (let i = 0; i < 30; i++) {
      a.step(coast);
      b.step(coast);
    }
    expect(a.position.distanceTo(b.position)).toBe(0);
    expect(a.heading.distanceTo(h)).toBeLessThan(1e-10);
  });
  it.each([-1, 1])(
    "countersteers existing roll and yaw %s without reversing either",
    (sign) => {
      const v = flying(),
        neutral = flying();
      for (const c of [v, neutral])
        c.angularVelocity
          .copy(c.heading)
          .multiplyScalar(sign * 2)
          .addScaledVector(c.up, -sign * 1.5);
      for (let i = 0; i < 60; i++) {
        v.step({ ...coast, steer: -sign });
        neutral.step(coast);
      }
      expect(v.angularVelocity.length()).toBeLessThan(0.02);
      expect(v.position.distanceTo(neutral.position)).toBe(0);
      expect(neutral.angularVelocity.length()).toBeGreaterThan(2);
    },
  );
  it("keeps spinning on release and same-direction steering without leveling", () => {
    const a = flying(),
      b = flying();
    for (const v of [a, b]) v.angularVelocity.copy(v.heading).multiplyScalar(2);
    for (let i = 0; i < 60; i++) {
      a.step(coast);
      b.step({ ...coast, steer: 1 });
    }
    expect(a.angularVelocity.length()).toBeGreaterThan(1.8);
    expect(a.up.distanceTo(b.up)).toBeLessThan(1e-10);
    expect(a.up.y).toBeLessThan(0.7);
  });
  it("brake cannot recover a roof-first car", () => {
    const v = flying();
    v.up.negate();
    for (let i = 0; i < 60; i++) v.step({ ...coast, brake: true });
    expect(v.up.y).toBe(-1);
    expect(v.grounded).toBe(false);
  });
  it("throttle release increases drag without adding airborne propulsion", () => {
    const a = flying(),
      b = flying();
    const start = a.velocity.clone();
    for (let i = 0; i < 60; i++) {
      a.step(coast);
      b.step({ ...coast, throttle: 0 });
    }
    expect(a.velocity.x).toBeCloseTo(start.x, 10);
    expect(a.velocity.z).toBeCloseTo(start.z, 10);
    expect(a.velocity.y).toBeCloseTo(-15, 10);
    expect(b.travel).toBeLessThan(a.travel);
  });
  it("inherits recent chassis rotation and preserves takeoff velocity and attitude", () => {
    const v = new Vehicle();
    v.reset(track.gaps[0][0] - 0.003);
    v.velocity.copy(v.heading).multiplyScalar(70);
    let previous = v.heading.clone(),
      previousVelocity = v.velocity.clone(),
      launch = false;
    for (let i = 0; i < 80; i++) {
      previous.copy(v.heading);
      previousVelocity.copy(v.velocity);
      v.step(coast);
      if (!v.grounded) {
        launch = true;
        break;
      }
    }
    expect(launch).toBe(true);
    expect(v.heading.angleTo(previous)).toBeLessThan(0.04);
    expect(v.velocity.distanceTo(previousVelocity)).toBeLessThan(2);
    expect(v.angularVelocity.length()).toBeGreaterThan(0.01);
    expect(v.contactMask).toBe(0);
  });
  it("retains tangential momentum on flat wheels and loses more on uneven/spinning contact", () => {
    const speeds = [];
    for (const angle of [0, 0.4, Math.PI / 2, Math.PI]) {
      const v = new Vehicle(),
        f = frame(0);
      v.position.addScaledVector(f.up, 0.2);
      v.velocity.copy(f.forward).multiplyScalar(40).addScaledVector(f.up, -60);
      v.up.applyAxisAngle(v.heading, angle);
      v.grounded = false;
      v.step(coast);
      expect(v.grounded).toBe(angle < 1);
      speeds.push(v.velocity.dot(f.forward));
    }
    expect(speeds[0]).toBeCloseTo(40, 4);
    expect(speeds[1]).toBeLessThan(speeds[0]);
    expect(speeds[2]).toBeLessThan(speeds[1]);
  });
  it("is deterministic across batches and resets rotation", () => {
    const run = (batch: number) => {
      const v = flying();
      v.angularVelocity.set(0.2, 0.1, 0.3);
      for (let i = 0; i < 120; i += batch)
        for (let j = 0; j < batch; j++)
          v.step(
            { ...coast, steer: i + j < 60 ? 1 : -1, brake: i + j >= 60 },
            STEP,
          );
      return v;
    };
    const a = run(1),
      b = run(4);
    expect(a.up.distanceTo(b.up)).toBe(0);
    expect(a.position.distanceTo(b.position)).toBe(0);
    expect(Math.abs(a.up.dot(a.heading))).toBeLessThan(1e-10);
    a.reset(0);
    expect(a.angularVelocity.length()).toBe(0);
  });
});
