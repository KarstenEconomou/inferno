import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { writeFileSync } from "node:fs";
import { Vehicle, STEP, type Input } from "../src/sim/vehicle";
import { HANDLING as H } from "../src/sim/handling";

// An unbounded flat road isolates tire dynamics from rails, bank and track
// curvature. The production wheel probes and vehicle solver still run, and
// the car travels freely rather than being repositioned between steps.
vi.mock("../src/track", async () => {
  const { Vector3 } = await import("three");
  const length = 100000;
  const frame = (t: number) => ({
    p: new Vector3(0, 0, -t * length),
    forward: new Vector3(0, 0, -1),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
  });
  return {
    length,
    frame,
    track: { width: length, boosts: [], gaps: [] },
    deckSegments: [],
    inGap: () => false,
    wrap: (t: number) => t,
    roadWidth: () => length,
    lane: () => ({ offset: 0, halfWidth: length / 2 }),
    paved: () => 1,
    surfaceGrip: () => 1,
    surfaceDrag: () => 0,
    onCourseChange: () => () => {},
    surface: () => ({ normal: new Vector3(0, 1, 0) }),
    nearest: (p: Vector3) => ({
      ...frame(-p.z / length),
      t: -p.z / length,
      lateral: p.x,
      height: p.y,
    }),
  };
});

const drive: Input = { throttle: 1, steer: 0, brake: false };
function moving(speed = 60) {
  const v = new Vehicle();
  v.velocity.copy(v.heading).multiplyScalar(speed);
  return v;
}
function steps(v: Vehicle, input: Input, count: number) {
  for (let i = 0; i < count; i++) v.step(input);
}
function prepared(steer = 1) {
  const v = moving();
  steps(v, { ...drive, steer }, 48);
  return v;
}
function slide(steer = 1) {
  const v = prepared(steer);
  steps(v, { ...drive, steer, brake: true }, 120);
  return v;
}

describe("flat-road handling", () => {
  it.each([35, 60])(
    "turns the chassis with a short steering tap at %s m/s",
    (speed) => {
      for (const steer of [-1, 1]) {
        const v = moving(speed);
        const initial = v.heading.clone();
        for (let i = 0; i < 36; i++) {
          v.step({ ...drive, steer: i < 12 ? steer : 0 });
          // Normal steering traces an arc aligned to the chassis, not a strafe.
          expect(
            v.heading.angleTo(v.velocity.clone().normalize()),
          ).toBeLessThan(0.025);
        }
        expect(v.heading.angleTo(initial)).toBeGreaterThan(0.03);
        expect(v.position.x * steer).toBeGreaterThan(0.1);
      }
    },
  );

  it.each([0, 6, 12, 24])(
    "accepts a powered slide with brake applied after %s steering ticks",
    (lead) => {
      for (const steer of [-1, 1]) {
        const v = moving();
        steps(v, { ...drive, steer }, lead);
        const entry = v.speed;
        let minimum = entry;
        for (let i = 0; i < 120; i++) {
          v.step({ ...drive, steer, brake: true });
          minimum = Math.min(minimum, v.speed);
        }
        expect(v.driftPhase).toBe("drift");
        expect(Math.abs(v.slipAngle)).toBeGreaterThan(0.12);
        expect(minimum).toBeGreaterThan(entry - 1);
      }
    },
  );

  it.each([0, -1])(
    "keeps drive during a steering correction with brake held: %s",
    (steer) => {
      const v = slide();
      const entry = v.speed;
      steps(v, { ...drive, steer, brake: true }, 12);
      expect(v.speed).toBeGreaterThan(entry - 1);
      expect(v.driftPhase).toBe("recovery");
    },
  );

  it.each([-0.5, 0.5])(
    "can finish drift preparation at half stick: %s",
    (steer) => {
      const v = moving();
      steps(v, { ...drive, steer, brake: true }, 120);
      expect(v.driftPhase).toBe("drift");
      expect(Math.abs(v.slipAngle)).toBeGreaterThan(0.05);
      expect(v.speed).toBeGreaterThan(59);
    },
  );

  it("clears a pending drift request on reset, flight, neutral and throttle or brake release", () => {
    for (const action of ["reset", "flight", "neutral", "lift", "release"]) {
      const v = moving();
      steps(v, { ...drive, steer: 1, brake: true }, 6);
      expect(v.driftBlend).toBe(0);
      if (action === "reset") v.reset(0);
      else if (action === "flight") {
        v.grounded = false;
        v.position.y = 20;
        v.step({ ...drive, steer: 1, brake: true });
        v.position.set(0, H.clearance, 0);
        v.grounded = true;
      } else
        v.step({
          throttle: action === "lift" ? 0 : 1,
          steer: action === "neutral" ? 0 : 1,
          brake: action !== "release",
        });
      v.velocity.copy(v.heading).multiplyScalar(50);
      steps(v, { ...drive, steer: 1, brake: true }, 60);
      expect(v.driftBlend).toBe(0);
      expect(v.speed).toBeLessThan(25);
    }
  });

  // Measured with this fixture before handling-12; these are velocity
  // curvature reversals, not wheel-angle or chassis-yaw reversals.
  it.each([
    [35, 20 * STEP],
    [53, 21 * STEP],
    [70, 21 * STEP],
  ])(
    "reverses the travel direction response at least 30%% faster at %s m/s",
    (speed, baseline) => {
      const times = [];
      for (const steer of [-1, 1]) {
        const v = moving(speed);
        steps(v, { ...drive, steer }, 60);
        let time = Infinity;
        for (let i = 0; i < 120; i++) {
          const before = v.velocity.clone();
          v.step({ ...drive, steer: -steer });
          if (time === Infinity && before.cross(v.velocity).y * steer > 0)
            time = (i + 1) * STEP;
          expect(v.driftPhase).toBe("grip");
          expect(Math.abs(v.slipAngle)).toBeLessThan((3 * Math.PI) / 180);
        }
        expect(time).toBeLessThanOrEqual(baseline * 0.7);
        times.push(time);
      }
      expect(times[0]).toBe(times[1]);
    },
  );

  it("absorbs lateral momentum promptly through tire forces", () => {
    const v = moving();
    v.velocity.x = 8;
    const before = v.velocity.clone();
    v.step(drive);
    expect(v.velocity.distanceTo(before)).toBeLessThan(2.3);
    expect(v.velocity.x).toBeGreaterThan(0);
    steps(v, drive, 24);
    const sideSpeed = Math.abs(v.velocity.dot(v.heading.clone().cross(v.up)));
    expect(sideSpeed).toBeLessThan(0.1);
    expect(v.driftBlend).toBe(0);
  });

  it.each([-1, 1])("holds a smooth long drift in direction %s", (steer) => {
    const v = prepared(steer);
    const entrySpeed = v.speed;
    const samples = [];
    let inBand = 0,
      maxYaw = 0,
      maxSlip = 0;
    for (let i = 0; i < 480; i++) {
      const velocity = v.velocity.clone(),
        heading = v.heading.clone(),
        yaw = v.yawRate;
      v.step({ ...drive, steer, brake: true });
      const slip = (Math.abs(v.slipAngle) * 180) / Math.PI;
      maxSlip = Math.max(maxSlip, slip);
      maxYaw = Math.max(maxYaw, Math.abs(v.yawRate));
      if (i >= 60 && slip >= 10 && slip <= 30) inBand++;
      expect(v.driftPhase).toBe("drift");
      expect(v.contactMask).toBe(15);
      expect(v.railContact).toBe(false);
      expect(Math.abs(v.yawRate - yaw)).toBeLessThan(0.15);
      expect(v.heading.angleTo(heading)).toBeLessThan(0.025);
      expect(v.velocity.distanceTo(velocity)).toBeLessThan(1.5);
      if (i % 30 === 0)
        samples.push({
          time: (i + 1) * STEP,
          speed: v.speed,
          slip,
          yaw: v.yawRate,
        });
    }
    expect(inBand / 420).toBeGreaterThan(0.9);
    expect(maxSlip).toBeLessThan(30);
    expect(maxYaw).toBeLessThan(2.2);
    expect(v.speed).toBeGreaterThan(60);
    expect(samples.every((sample) => sample.speed >= entrySpeed - 0.5)).toBe(
      true,
    );
    writeFileSync(
      `/tmp/inferno-long-drift-${steer}.json`,
      JSON.stringify(samples, null, 2),
    );
  });

  it("keeps analog steering progressive without accidental sliding", () => {
    const yaw = [0.25, 0.5, 0.75, 1].map((steer) => {
      const v = moving();
      steps(v, { ...drive, steer }, 120);
      expect(v.driftPhase).toBe("grip");
      expect(Math.abs(v.slipAngle)).toBeLessThan(0.05);
      return Math.abs(v.yawRate);
    });
    for (let i = 1; i < yaw.length; i++) {
      expect(yaw[i] - yaw[i - 1]).toBeGreaterThan(0.15);
      expect(yaw[i] - yaw[i - 1]).toBeLessThan(0.5);
    }
  });

  it.each([-1, 1])(
    "uses entry speed only to initiate, not to interrupt entry %s",
    (steer) => {
      for (const speed of [52.99, 53.01]) {
        const v = prepared(steer);
        v.velocity.copy(v.heading).multiplyScalar(speed);
        steps(v, { ...drive, steer, brake: true }, 36);
        expect(v.driftPhase).toBe(speed < 53 ? "grip" : "drift");
        expect(v.driftBlend).toBe(speed < 53 ? 0 : 1);
      }
    },
  );

  it("requires continuous preparation and clears it on reverse input, neutral, flight and reset", () => {
    for (const clear of ["reverse", "neutral", "air", "reset"]) {
      const v = prepared();
      expect(v.driftReadiness).toBeGreaterThanOrEqual(H.driftReadiness);
      if (clear === "reset") v.reset(0);
      else if (clear === "air") {
        v.grounded = false;
        v.position.y = 20;
        v.step({ ...drive, steer: 1 });
        v.position.set(0, H.clearance, 0);
        v.grounded = true;
      } else v.step({ ...drive, steer: clear === "reverse" ? -1 : 0 });
      v.velocity.copy(v.heading).multiplyScalar(60);
      v.step({ ...drive, steer: 1, brake: true });
      expect(v.driftReadiness).toBeLessThan(H.driftReadiness);
      expect(v.driftBlend).toBe(0);
    }
    const v = moving();
    steps(v, { ...drive, steer: 1, brake: true }, 30);
    expect(v.driftBlend).toBe(0);
  });

  it.each([-1, 1])(
    "opens the line on release and allows brake reapplication %s",
    (steer) => {
      const held = slide(steer),
        released = slide(steer);
      steps(held, { ...drive, steer, brake: true }, 48);
      steps(released, { ...drive, steer }, 48);
      expect(released.driftBlend).toBe(0);
      expect(released.speed).toBeGreaterThan(held.speed);
      // Regaining grip first brings travel toward the chassis direction; once
      // settled, the released line must have less curvature than a held drift.
      const heldEntry = held.velocity.clone(),
        releasedEntry = released.velocity.clone();
      steps(held, { ...drive, steer, brake: true }, 24);
      steps(released, { ...drive, steer }, 24);
      expect(released.velocity.angleTo(releasedEntry)).toBeLessThan(
        held.velocity.angleTo(heldEntry),
      );
      const retapped = slide(steer);
      retapped.velocity.multiplyScalar(50 / retapped.velocity.length());
      steps(retapped, { ...drive, steer }, 12);
      expect(retapped.driftPhase).toBe("recovery");
      expect(retapped.speed).toBeLessThan(H.driftStartSpeed);
      const blend = retapped.driftBlend;
      retapped.step({ ...drive, steer, brake: true });
      expect(retapped.driftPhase).toBe("drift");
      expect(retapped.driftBlend).toBeGreaterThan(blend);
      steps(retapped, { ...drive, steer, brake: true }, 120);
      expect(retapped.driftPhase).toBe("drift");
    },
  );

  it.each([-1, 1])("countersteers out faster without snapping %s", (steer) => {
    const counter = slide(steer),
      released = slide(steer);
    for (let i = 0; i < 30; i++) {
      const heading = counter.heading.clone(),
        velocity = counter.velocity.clone();
      counter.step({ ...drive, steer: -steer });
      released.step({ ...drive, steer });
      expect(counter.heading.angleTo(heading)).toBeLessThan(0.025);
      expect(counter.velocity.distanceTo(velocity)).toBeLessThan(2);
    }
    expect(counter.driftBlend).toBe(0);
    expect(released.driftBlend).toBeGreaterThan(0);
    expect(Math.abs(counter.slipAngle)).toBeLessThan(0.05);
  });

  it("dissipates passive mechanical energy through entry and recovery", () => {
    const v = prepared();
    for (let i = 0; i < 240; i++) {
      const before = v.velocity.lengthSq() + H.yawInertia * v.yawRate ** 2;
      v.step({
        throttle: 0,
        steer: i < 120 ? 1 : -1,
        brake: i < 120 && v.speed > 3,
      });
      const after = v.velocity.lengthSq() + H.yawInertia * v.yawRate ** 2;
      expect(after).toBeLessThanOrEqual(before + 1e-8);
    }
  });

  it("keeps engine drive from the first drift step and brakes when throttle is lifted", () => {
    const powered = prepared(),
      braked = prepared();
    const entry = powered.speed;
    steps(powered, { ...drive, steer: 1, brake: true }, 30);
    steps(braked, { throttle: 0, steer: 1, brake: true }, 30);
    expect(powered.speed).toBeGreaterThan(entry - 0.5);
    expect(braked.speed).toBeLessThan(entry - 10);
    expect(powered.driftPhase).toBe("drift");
    const beforeLift = powered.speed;
    steps(powered, { throttle: 0, steer: 1, brake: true }, 30);
    expect(powered.speed).toBeLessThan(beforeLift - 10);
  });

  it("retains momentum without outperforming straight acceleration or preserving an excessive slide", () => {
    const controlled = slide(),
      excessive = slide();
    const straight = moving(controlled.speed);
    excessive.velocity.applyAxisAngle(
      excessive.up,
      -Math.sign(excessive.yawRate) * 0.8,
    );
    const initial = controlled.speed;
    let controlledDistance = 0,
      straightDistance = 0;
    for (let i = 0; i < 120; i++) {
      controlled.step({ ...drive, steer: 1, brake: true });
      excessive.step({ ...drive, steer: 1, brake: true });
      straight.step(drive);
      controlledDistance += controlled.speed * STEP;
      straightDistance += straight.speed * STEP;
    }
    expect(controlled.speed).toBeGreaterThan(initial - 1);
    expect(controlled.speed).toBeLessThan(straight.speed);
    expect(controlledDistance).toBeLessThan(straightDistance);
    expect(excessive.speed).toBeLessThan(controlled.speed - 5);
  });
});
