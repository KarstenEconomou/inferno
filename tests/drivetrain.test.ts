import { Vehicle } from "../src/sim";
import { frame, roadWidth } from "../src/track";
import { describe, it, expect } from "vitest";
import { drivetrainTargets, ThrottleAttack } from "../src/audio/drivetrain";
import { idleTelemetry, vehicleParameters } from "../src/audio/model";
const motor = (speed: number, throttle = 1, grounded = true) =>
  drivetrainTargets(
    vehicleParameters({
      ...idleTelemetry,
      speed,
      forward: speed,
      throttle,
      grounded,
    }),
  );
const energy = (m: ReturnType<typeof motor>) =>
  m.harmonic + m.overtone + m.upper;
describe("responsive drivetrain", () => {
  it("moves apparent register upward continuously without fake gear resets", () => {
    let previous = -Infinity;
    for (let speed = 0; speed <= 90; speed += 0.25) {
      const m = motor(speed);
      const register = (m.harmonic + m.overtone * 2 + m.upper * 3) / energy(m);
      expect(register).toBeGreaterThanOrEqual(previous - 1e-10);
      previous = register;
    }
    expect(motor(80).body).toBeGreaterThan(motor(0).body * 0.7);
    expect(motor(80).harmonic).toBeGreaterThan(motor(0).harmonic * 0.7);
    expect(motor(80).harmonic).toBeGreaterThan(motor(80).overtone * 1.5);
    expect(motor(80).upper).toBeLessThan(motor(80).harmonic * 0.15);
  });
  it("responds separately to throttle and loss of contact", () => {
    const drive = motor(50),
      coast = motor(50, 0),
      air = motor(50, 1, false);
    expect(energy(coast)).toBeLessThan(energy(drive) * 0.25);
    expect(coast.cutoff).toBeLessThan(drive.cutoff * 0.65);
    expect(air.body).toBeLessThan(drive.body * 0.1);
    expect(energy(air)).toBeLessThan(energy(drive) * 0.2);
    expect(motor(50).register).toBe(coast.register);
    expect(motor(50).register).toBe(air.register);
  });
  it("follows collision-resolved momentum and leaves a stopped wall contact silent of scrape", () => {
    const hit = (glance: boolean) => {
      const v = new Vehicle(),
        t = 0.11,
        f = frame(t);
      v.reset(t);
      v.position.addScaledVector(
        f.right,
        roadWidth(t) / 2 - (glance ? 1.4 : 1.5),
      );
      v.heading.copy(
        glance
          ? f.forward.clone().addScaledVector(f.right, 0.4).normalize()
          : f.right,
      );
      v.velocity.copy(v.heading).multiplyScalar(40);
      v.step({ throttle: 1, steer: 0, brake: false });
      const p = vehicleParameters({
        ...idleTelemetry,
        speed: v.velocity.length(),
        forward: v.velocity.dot(v.heading),
        throttle: 1,
        scrape: v.railContact,
      });
      return { v, p, sound: drivetrainTargets(p, 0, v.railContact) };
    };
    const head = hit(false),
      glance = hit(true);
    expect(head.v.railImpact).toBeGreaterThan(glance.v.railImpact);
    expect(head.p.speed).toBeLessThan(0.1);
    expect(head.p.scrape).toBe(0);
    expect(head.sound.register).toBeLessThan(0.001);
    expect(head.sound.body).toBeGreaterThan(motor(0, 0).body);
    expect(head.sound.cutoff).toBeLessThan(motor(0).cutoff);
    expect(glance.p.speed).toBeGreaterThan(30);
    expect(glance.p.scrape).toBeGreaterThan(0);
    expect(glance.sound.register).toBeGreaterThan(0.3);
  });
  it("articulates throttle once, settles, and resets independently of frame rate", () => {
    for (const hz of [30, 60, 120]) {
      const attack = new ThrottleAttack();
      expect(attack.update(1, 0)).toBe(1);
      let value = 1;
      for (let n = 1; n <= hz * 3; n++) value = attack.update(1, n / hz);
      expect(value).toBeLessThan(1e-12);
      expect(attack.update(0, 3.01)).toBe(0);
      attack.update(0, 3.5);
      expect(attack.update(1, 3.51)).toBeGreaterThan(0.8);
      attack.reset();
      expect(attack.update(1, 10)).toBe(1);
    }
  });
});
