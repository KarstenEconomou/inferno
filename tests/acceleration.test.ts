import { describe, it, expect } from "vitest";
import { Vehicle, STEP, type Input } from "../src/sim";
import { frame, track } from "../src/track";
import { HANDLING as H, propulsionAcceleration } from "../src/sim/handling";
import { writeFileSync } from "node:fs";
const drive: Input = { throttle: 1, brake: false, steer: 0 };
// Hold the car over the level grid to measure the drivetrain independent of
// cornering, grade, scenery or lap markers. Velocity is never overwritten.
function tick(v: Vehicle, input = drive) {
  const f = frame(0);
  v.position.copy(f.p).addScaledVector(f.up, 0.65);
  v.step(input);
}
describe("time-trial acceleration", () => {
  it("launches decisively, tapers toward terminal speed, and keeps high-speed momentum", () => {
    const v = new Vehicle(),
      milestones: Record<string, number> = {};
    let previous = 0,
      first = 0,
      last = 0;
    for (let i = 0; i < 120 * 12; i++) {
      tick(v);
      const speed = v.velocity.length(),
        acceleration = (speed - previous) / STEP;
      if (i === 1) first = acceleration;
      if (i === 120 * 10) last = acceleration;
      for (const kph of [100, 200, 250])
        if (!milestones[kph] && speed * 3.6 >= kph)
          milestones[kph] = (i + 1) * STEP;
      expect(speed).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = speed;
    }
    // The supplied Stadium gameplay reaches about 100 km/h at 1.8 s. Match
    // that progressive launch and retain useful acceleration above 200 km/h.
    expect(milestones[100]).toBeGreaterThan(1.65);
    expect(milestones[100]).toBeLessThan(1.95);
    expect(milestones[200]).toBeGreaterThan(3.8);
    expect(milestones[200]).toBeLessThan(4.5);
    expect(milestones[250]).toBeGreaterThan(5.7);
    expect(milestones[250]).toBeLessThan(6.5);
    expect(first).toBeGreaterThan(14);
    expect(last).toBeLessThan(2);
    expect(v.speed).toBeGreaterThan(H.maxSpeed - 2);
    expect(v.speed).toBeLessThan(H.maxSpeed);
    const top = v.speed;
    tick(v, { ...drive, throttle: 0 });
    expect(top - v.speed).toBeLessThan(0.2);
    writeFileSync(
      "/tmp/inferno-acceleration.json",
      JSON.stringify({ milestones, terminalKph: top * 3.6 }, null, 2),
    );
  });
  it("balances thrust and resistance at each terminal speed", () => {
    for (const boosted of [false, true]) {
      const speed = boosted ? H.boostSpeed : H.maxSpeed;
      expect(propulsionAcceleration(speed, boosted)).toBeCloseTo(
        H.rollingDrag + H.aeroDrag * speed * speed,
        10,
      );
      expect(propulsionAcceleration(speed + 10, boosted)).toBeLessThan(
        propulsionAcceleration(speed, boosted),
      );
    }
  });
  it("activates a boost as acceleration, never as an instantaneous speed assignment", () => {
    const v = new Vehicle();
    v.reset(track.boosts[0]);
    v.velocity.copy(v.heading).multiplyScalar(45);
    const before = v.velocity.length();
    v.step(drive);
    expect(v.boost).toBe(H.boostDuration);
    expect(v.speed - before).toBeGreaterThan(0);
    expect(v.speed - before).toBeLessThan(H.boostAcceleration * STEP);
    const f = frame(track.boosts[0]);
    for (let i = 0; i < 10; i++) {
      const remaining = v.boost;
      v.position.copy(f.p).addScaledVector(f.up, 0.65);
      v.step(drive);
      expect(v.boost).toBeLessThan(remaining);
    }
  });
  it("rewards a faster entry, expires smoothly, and never stacks duration", () => {
    const outputs = [];
    for (const speed of [40, 70, 100]) {
      const v = new Vehicle();
      v.velocity.copy(v.heading).multiplyScalar(speed);
      v.boost = H.boostDuration;
      for (let i = 0; i < Math.round(H.boostDuration / STEP); i++) tick(v);
      outputs.push(v.speed);
      const before = v.speed;
      tick(v);
      expect(Math.abs(v.speed - before)).toBeLessThan(0.5);
      expect(v.boost).toBe(0);
    }
    expect(outputs[1]).toBeGreaterThan(outputs[0] + 5);
    expect(outputs[2]).toBeGreaterThan(outputs[1]);
    expect(outputs[1]).toBeGreaterThan(85);
    const v = new Vehicle();
    v.boost = 0.6;
    v.reset(track.boosts[0]);
    v.boost = 0.6;
    v.step(drive);
    expect(v.boost).toBe(H.boostDuration);
    writeFileSync(
      "/tmp/inferno-boost.json",
      JSON.stringify({ entry: [40, 70, 100], exit: outputs }, null, 2),
    );
  });
  it("gives braking priority and does not propel a car in the air or driving backward over a pad", () => {
    const a = new Vehicle(),
      b = new Vehicle();
    for (const v of [a, b]) v.velocity.copy(v.heading).multiplyScalar(70);
    a.boost = H.boostDuration;
    tick(a, { ...drive, brake: true });
    tick(b, { ...drive, brake: true });
    expect(a.velocity.distanceTo(b.velocity)).toBeLessThan(1e-10);
    for (const v of [a, b]) {
      v.grounded = false;
      v.position.y += 20;
    }
    a.step(drive);
    b.step(drive);
    expect(a.velocity.distanceTo(b.velocity)).toBeLessThan(1e-10);
    const reverse = new Vehicle();
    reverse.reset(track.boosts[0]);
    reverse.velocity.copy(reverse.heading).multiplyScalar(-10);
    reverse.step({ ...drive, throttle: 0 });
    expect(reverse.boost).toBe(0);
  });
});
