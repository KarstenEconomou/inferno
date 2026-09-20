import { describe, it, expect } from "vitest";
import { Vehicle, STEP, type Input } from "../src/sim";
import { frame } from "../src/track";
import { HANDLING as H } from "../src/sim/handling";
const drive: Input = { throttle: 1, steer: 0, brake: false };
function moving(speed = 60) {
  const v = new Vehicle();
  v.velocity.copy(v.heading).multiplyScalar(speed);
  return v;
}
function tireSteps(v: Vehicle, input: Input, count: number) {
  const f = frame(0);
  for (let i = 0; i < count; i++) {
    v.position.copy(f.p).addScaledVector(f.up, H.clearance);
    v.step(input);
  }
}
function slide(steer = 1) {
  const v = moving();
  tireSteps(v, { ...drive, steer }, 48);
  tireSteps(v, { ...drive, steer, brake: true }, 55);
  return v;
}
describe("brake-induced powerslides", () => {
  it.each([-1, 1])(
    "builds steering and lateral load before brake entry %s",
    (steer) => {
      const v = moving(53);
      tireSteps(v, { ...drive, steer }, 24);
      expect(v.driftReadiness).toBeLessThan(H.driftReadiness);
      tireSteps(v, { ...drive, steer }, 24);
      expect(v.driftReadiness).toBeGreaterThan(H.driftReadiness);
      tireSteps(v, { ...drive, steer, brake: true }, 1);
      expect(v.driftPhase).toBe("drift");
      expect(Math.sign(v.yawRate)).toBe(-steer);
    },
  );
  it("does not initiate below 53 m/s or from a brake-first straight approach", () => {
    for (const speed of [12, 35, 52.5]) {
      const v = moving(speed);
      v.steering = 1;
      v.lateralLoad = 30;
      v.step({ ...drive, steer: 1, brake: true });
      expect(v.driftPhase).toBe("grip");
    }
    const v = moving(55);
    tireSteps(v, { ...drive, brake: true }, 20);
    tireSteps(v, { ...drive, steer: 1, brake: true }, 60);
    expect(v.driftBlend).toBe(0);
  });
  it.each([-1, 1])(
    "sustains slip below initiation speed, then recovers with countersteer %s",
    (steer) => {
      const v = slide(steer);
      expect(v.driftPhase).toBe("drift");
      expect(Math.abs(v.slipAngle)).toBeGreaterThan(0.12);
      v.velocity.multiplyScalar(45 / v.velocity.length());
      tireSteps(v, { ...drive, steer, brake: true }, 10);
      expect(v.driftPhase).toBe("drift");
      const angle = Math.abs(v.slipAngle);
      tireSteps(v, { ...drive, steer: -steer, brake: false }, 50);
      expect(Math.abs(v.slipAngle)).toBeLessThan(angle);
      expect(v.driftBlend).toBe(0);
    },
  );
  it("restores grip progressively without snapping velocity or heading", () => {
    const v = slide(),
      velocity = v.velocity.clone(),
      heading = v.heading.clone();
    tireSteps(v, { ...drive, steer: 0 }, 1);
    expect(v.driftPhase).toBe("recovery");
    expect(v.driftBlend).toBeGreaterThan(0.9);
    expect(v.velocity.distanceTo(velocity)).toBeLessThan(2);
    expect(v.heading.angleTo(heading)).toBeLessThan(0.05);
    tireSteps(v, drive, 120);
    expect(v.driftBlend).toBe(0);
    expect(Math.abs(v.slipAngle)).toBeLessThan(0.04);
  });
  it("makes brake tapping on a straight slower and never adds passive mechanical energy", () => {
    const straight = moving(),
      tapping = moving();
    let a = 0,
      b = 0;
    for (let i = 0; i < 240; i++) {
      tireSteps(straight, drive, 1);
      tireSteps(tapping, { ...drive, brake: i % 60 < 8 }, 1);
      a += straight.speed * STEP;
      b += tapping.speed * STEP;
    }
    expect(b).toBeLessThan(a);
    expect(tapping.speed).toBeLessThan(straight.speed);
    const v = moving();
    for (let i = 0; i < 240; i++) {
      const e = v.velocity.lengthSq() + H.yawInertia * v.yawRate ** 2;
      tireSteps(v, { throttle: 0, steer: Math.sin(i * 0.03), brake: false }, 1);
      expect(
        v.velocity.lengthSq() + H.yawInertia * v.yawRate ** 2,
      ).toBeLessThanOrEqual(e + 1e-8);
    }
  });
  it("allows propulsion while sliding but combined straight controls slow the car", () => {
    const a = slide(),
      b = slide(),
      straight = moving();
    tireSteps(a, { ...drive, steer: 1, brake: true }, 10);
    tireSteps(b, { ...drive, throttle: 0, steer: 1, brake: true }, 10);
    expect(a.speed).toBeGreaterThan(b.speed);
    expect(a.driftEngaged).toBe(true);
    tireSteps(straight, { ...drive, brake: true }, 30);
    expect(straight.speed).toBeLessThan(50);
    expect(straight.driftEngaged).toBe(false);
  });
  it("preserves sideways landing momentum and measures the resulting slide", () => {
    const v = moving(),
      f = frame(0),
      h = v.heading.clone();
    v.position.addScaledVector(f.up, 0.2);
    v.velocity.addScaledVector(f.right, 15).addScaledVector(f.up, -40);
    v.grounded = false;
    v.step(drive);
    expect(v.grounded).toBe(true);
    expect(v.velocity.dot(f.right)).toBeGreaterThan(14);
    expect(v.heading.dot(h)).toBeGreaterThan(0.999);
    expect(v.contactGrip).toBe(0);
    expect(v.slipIntensity).toBeGreaterThan(0.2);
    tireSteps(v, drive, 10);
    expect(v.contactGrip).toBeGreaterThan(0);
    expect(v.contactGrip).toBeLessThan(0.3);
  });
  it("resets derived handling state", () => {
    const v = slide();
    v.reset(0);
    expect(v.driftEngaged).toBe(false);
    expect([v.steering, v.yawRate, v.driftBlend, v.slipIntensity]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(v.contactMask).toBe(15);
  });
});
