import { HANDLING as H } from "../src/sim/handling";
import { drivingInput } from "./driver";
import { describe, it, expect } from "vitest";
import { sweepDeck } from "../src/sim/contact";
import { Vehicle, Race, STEP, parseRecord } from "../src/sim";
import { frame, track, TRACK_VERSION, nearest, roadWidth } from "../src/track";
describe("vehicle", () => {
  it("accelerates and braking sheds speed", () => {
    const v = new Vehicle();
    for (let i = 0; i < 240; i++)
      v.step({ throttle: 1, steer: 0, brake: false });
    expect(v.speed * 3.6).toBeGreaterThan(100);
    const fast = v.speed;
    for (let i = 0; i < 60; i++) v.step({ throttle: 0, steer: 0, brake: true });
    expect(v.speed).toBeLessThan(fast - 15);
  });
  it("activates a boost once per entry", () => {
    const v = new Vehicle();
    v.reset(track.boosts[0]);
    v.step({ throttle: 0, steer: 0, brake: true });
    expect(v.boost).toBeGreaterThan(0.8);
    const boost = v.boost;
    v.step({ throttle: 0, steer: 0, brake: true });
    expect(v.boost).toBeLessThan(boost);
  });
  it("uses a fixed simulation step independent of render rate", () => {
    const run = (fps: number) => {
      const v = new Vehicle();
      let acc = 0;
      for (let i = 0; i < fps * 2; i++) {
        acc += 1 / fps;
        while (acc >= STEP - 1e-10) {
          v.step({ throttle: 1, steer: 0.1, brake: false });
          acc -= STEP;
        }
      }
      return v;
    };
    const a = run(30),
      b = run(144);
    expect(a.position.distanceTo(b.position)).toBeLessThan(0.0001);
    expect(a.speed).toBeCloseTo(b.speed, 8);
  });
  it.each([0, 0.3, 0.86])(
    "stops grounded rail hits at %s and permits reversing away",
    (t) => {
      for (const side of [-1, 1]) {
        const v = new Vehicle(),
          f = frame(t);
        v.reset(t);
        v.position.addScaledVector(f.right, side * (roadWidth(t) / 2 - 1.5));
        v.heading.copy(f.right).multiplyScalar(side);
        const heading = v.heading.clone();
        v.velocity.copy(v.heading).multiplyScalar(45);
        v.step({ throttle: 1, steer: 0, brake: false });
        expect(v.grounded).toBe(true);
        expect(v.speed).toBe(0);
        expect(v.heading.dot(heading)).toBeGreaterThan(0.9); // Tire moments may yaw gradually; rails cannot flip the drive direction.
        const stopped = v.position.clone();
        for (let i = 0; i < 240; i++) {
          v.step({ throttle: 1, steer: 0, brake: false });
          expect(v.grounded).toBe(true);
          expect(nearest(v.position).height).toBeCloseTo(0.65, 1);
        }
        // A bank can produce a few centimetres of creep along the rail.
        expect(v.position.distanceTo(stopped)).toBeLessThan(0.1);
        for (let i = 0; i < 60; i++)
          v.step({ throttle: -1, steer: 0, brake: false });
        expect(v.grounded).toBe(true);
        expect(Math.abs(nearest(v.position).lateral)).toBeLessThan(
          roadWidth(t) / 2 - 2,
        );
      }
    },
  );
  it.each([-1, 1])(
    "slides along rail %s while retaining forward momentum",
    (side) => {
      const v = new Vehicle(),
        f = frame(0.11);
      v.reset(0.11);
      v.position.addScaledVector(f.right, side * (roadWidth(0.11) / 2 - 1.4));
      v.heading
        .copy(f.forward)
        .addScaledVector(f.right, side * 0.4)
        .normalize();
      v.velocity.copy(v.heading).multiplyScalar(40);
      const old = v.position.clone();
      v.step({ throttle: 0, steer: 0, brake: false });
      expect(v.grounded).toBe(true);
      expect(v.speed).toBeGreaterThan(30);
      expect(Math.abs(v.velocity.dot(nearest(v.position).right))).toBeLessThan(
        0.1,
      );
      expect(v.position.clone().sub(old).dot(f.forward)).toBeGreaterThan(0.2);
      for (let i = 0; i < 120; i++) {
        v.step({ throttle: 1, steer: side * 0.25, brake: false });
        expect(v.grounded).toBe(true);
        expect(nearest(v.position).height).toBeCloseTo(0.65, 1);
      }
    },
  );
  it.each([-1, 1])(
    "does not steer the chassis forward when grazing rail %s",
    (side) => {
      for (const direction of [-1, 1]) {
        const v = new Vehicle(),
          f = frame(0);
        v.position.addScaledVector(f.right, side * (roadWidth(0) / 2 - 1.4));
        v.heading
          .copy(f.forward)
          .addScaledVector(f.right, side * 0.6)
          .normalize()
          .multiplyScalar(direction);
        const heading = v.heading.clone();
        v.velocity.copy(v.heading).multiplyScalar(direction * 40);
        // Reverse speed is intentionally below the normal reverse cap.
        if (direction < 0) v.velocity.copy(v.heading).multiplyScalar(-10);
        for (let i = 0; i < 120; i++) {
          const before = v.heading.clone();
          v.step({ throttle: direction, steer: 0, brake: false });
          expect(v.heading.angleTo(before)).toBeLessThan(0.03); // Tire moments can turn the car, never snap it.
          expect(v.heading.dot(heading)).toBeGreaterThan(0);
          expect(v.grounded).toBe(true);
          expect(v.speed * direction).toBeGreaterThanOrEqual(0);
        }
      }
    },
  );
  it.each([0.12, 0.42, 0.62, 0.74])(
    "sweeps fast landings onto the actual deck at %s without a position jump",
    (t) => {
      const v = new Vehicle(),
        f = frame(t);
      v.reset(t);
      v.position.addScaledVector(f.up, 1.35);
      v.grounded = false;
      v.velocity.copy(f.forward).multiplyScalar(45).addScaledVector(f.up, -300);
      const old = v.position.clone(),
        up = v.up.clone();
      v.step({ throttle: 0, steer: 0, brake: false });
      expect(v.grounded).toBe(true);
      expect(v.position.distanceTo(old)).toBeLessThan(2.6);
      expect(nearest(v.position).height).toBeGreaterThan(
        0.65 - H.suspensionTravel,
      );
      expect(v.up.dot(up)).toBeGreaterThan(0.99); // Wheel contact samples the local ribbon normal.
      for (let i = 0; i < 30; i++) {
        const before = v.position.clone();
        v.step({ throttle: 0, steer: 0, brake: false });
        if (!v.grounded) {
          // A very hard impact can leave too little downforce on a ceiling.
          expect(f.up.y).toBeLessThan(0);
          expect(v.speed).toBeLessThan(35);
          break;
        }
        expect(v.position.distanceTo(before)).toBeLessThan(0.6);
      }
    },
  );
  it("absorbs a hard landing with a brief suspension response and no repeated flight", () => {
    const v = new Vehicle(),
      f = frame(0);
    v.position.copy(f.p).addScaledVector(f.up, 0.9);
    v.velocity.copy(f.forward).multiplyScalar(40).addScaledVector(f.up, -35);
    v.grounded = false;
    v.angularVelocity.copy(f.forward).multiplyScalar(2);
    v.step({ throttle: 0, steer: 0, brake: false });
    expect(v.grounded).toBe(true);
    expect(v.landingImpact).toBe(1);
    expect(v.speed).toBeLessThan(37);
    expect(v.angularVelocity.length()).toBe(0);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      v.step({ throttle: 0, steer: 0, brake: false });
      peak = Math.max(peak, v.suspension);
      expect(v.grounded).toBe(true);
    }
    expect(peak).toBeGreaterThan(0.3);
    expect(Math.abs(v.suspension)).toBeLessThan(0.001);
  });
  it.each([-1, 1])(
    "bounces off rail %s at the contact point with speed loss and rotation",
    (side) => {
      const v = new Vehicle();
      v.reset(0.32);
      const f = frame(0.32);
      v.position
        .copy(f.p)
        .addScaledVector(f.right, side * (roadWidth(0.32) / 2 + 0.3))
        .addScaledVector(f.up, 2);
      v.velocity
        .copy(f.forward)
        .multiplyScalar(25)
        .addScaledVector(f.right, side * 8)
        .addScaledVector(f.up, -35);
      v.grounded = false;
      v.step({ throttle: 0, steer: 0, brake: false });
      expect(v.grounded).toBe(false);
      const contact = nearest(v.position);
      expect(Math.abs(contact.lateral)).toBeGreaterThan(
        roadWidth(contact.t) / 2,
      );
      expect(contact.height).toBeGreaterThan(1.79);
      expect(v.velocity.dot(contact.up)).toBeGreaterThan(0);
      expect(v.velocity.dot(contact.forward)).toBeLessThan(20);
      expect(v.angularVelocity.length()).toBeGreaterThan(1);
      const impactPosition = v.position.clone();
      for (let i = 0; i < 30; i++)
        v.step({ throttle: 1, steer: 1, brake: false });
      expect(v.position.distanceTo(impactPosition)).toBeGreaterThan(1);
      expect(v.up.dot(f.up)).toBeLessThan(0.99);
    },
  );
  it.each([-1, 1])(
    "reflects a fast side impact on rail %s without tunneling",
    (side) => {
      const v = new Vehicle(),
        f = frame(0);
      v.position
        .copy(f.p)
        .addScaledVector(f.right, side * (roadWidth(0) / 2 - 2.5))
        .addScaledVector(f.up, 0.9);
      v.velocity
        .copy(f.right)
        .multiplyScalar(side * 200)
        .addScaledVector(f.forward, 20);
      v.grounded = false;
      v.step({ throttle: 0, steer: 0, brake: false });
      const contact = nearest(v.position);
      expect(v.velocity.dot(f.right) * side).toBeLessThan(0);
      expect(Math.abs(contact.lateral)).toBeLessThan(roadWidth(0) / 2 - 1);
      expect(v.velocity.length()).toBeLessThan(100);
    },
  );
  it("does not turn a vertical drop into driving speed", () => {
    const v = new Vehicle();
    const f = frame(track.gaps[1][1] + 0.01);
    v.position.copy(f.p).addScaledVector(f.up, 1);
    // Drop normal to the actual mesh triangle (the smooth authored frame
    // differs slightly at a banked control point).
    const contact = sweepDeck(
      v.position,
      v.position.clone().addScaledVector(f.up, -2),
    )!;
    v.velocity.copy(contact.normal).multiplyScalar(-60);
    v.grounded = false;
    v.step({ throttle: 0, steer: 0, brake: false });
    expect(v.grounded).toBe(true);
    expect(v.speed).toBeLessThan(0.01);
    expect(v.heading.length()).toBeCloseTo(1);
  });
  it("does not snap a car below the deck or beyond the rail onto the track", () => {
    for (const lateral of [0, roadWidth(0) / 2 + 3]) {
      const v = new Vehicle(),
        f = frame(0);
      v.position
        .copy(f.p)
        .addScaledVector(f.up, lateral === 0 ? -1 : 1)
        .addScaledVector(f.right, lateral);
      v.velocity.copy(f.up).multiplyScalar(-60);
      v.grounded = false;
      v.step({ throttle: 0, steer: 0, brake: false });
      expect(v.grounded).toBe(false);
    }
  });
  it("releases the car into ballistic flight at a gap", () => {
    const v = new Vehicle();
    v.reset(track.gaps[0][0] - 0.001);
    v.velocity.copy(v.heading).multiplyScalar(55);
    let airborne = false;
    for (let i = 0; i < 60; i++) {
      v.step({ throttle: 1, steer: 0, brake: false });
      airborne ||= !v.grounded;
    }
    expect(airborne).toBe(true);
  });
});
describe("race rules", () => {
  function cross(r: Race, v: Vehicle, t: number, reverse = false) {
    const epsilon = 0.0001;
    r.lastProgress = t + (reverse ? epsilon : -epsilon);
    v.reset(t + (reverse ? -epsilon : epsilon));
    r.update(v, STEP);
  }
  it("rejects skipped and backward checkpoints", () => {
    const r = new Race(),
      v = new Vehicle();
    cross(r, v, track.checkpoints[1]);
    expect(r.nextCheckpoint).toBe(0);
    cross(r, v, track.checkpoints[0], true);
    expect(r.nextCheckpoint).toBe(0);
    cross(r, v, 0);
    expect(r.finished).toBe(false);
  });
  it("requires all ordered checkpoints and the forward finish crossing", () => {
    const r = new Race(),
      v = new Vehicle();
    for (const cp of track.checkpoints) cross(r, v, cp);
    expect(r.nextCheckpoint).toBe(track.checkpoints.length);
    cross(r, v, 0);
    expect(r.finished).toBe(true);
    expect(r.splits).toHaveLength(track.checkpoints.length);
  });
  it("respawns without clearing elapsed time or checkpoint progress", () => {
    const r = new Race(),
      v = new Vehicle();
    cross(r, v, track.checkpoints[0]);
    r.time = 24;
    r.respawn(v);
    expect(r.time).toBe(24);
    expect(r.nextCheckpoint).toBe(1);
    expect(v.speed).toBe(0);
    expect(v.progress).toBeCloseTo(track.checkpoints[0] + 0.002);
  });
  it("rejects malformed and obsolete records", () => {
    expect(parseRecord("{broken", TRACK_VERSION)).toBeNull();
    expect(
      parseRecord(JSON.stringify({ version: "old" }), TRACK_VERSION),
    ).toBeNull();
    const p = { t: 1, p: [0, 0, 0], h: [0, 0, -1], u: [0, 1, 0] };
    const data = {
      version: TRACK_VERSION,
      time: 60,
      splits: track.checkpoints.map((_, i) => (i + 1) * 10),
      poses: [p, { ...p, t: 2 }],
    };
    expect(parseRecord(JSON.stringify(data), TRACK_VERSION)).not.toBeNull();
  });
});
describe("course feasibility", () => {
  it("completes with discrete keyboard steering updated at 20 Hz", () => {
    const v = new Vehicle(),
      r = new Race();
    let input = { throttle: 1, steer: 0, brake: false };
    let falls = 0;
    for (let i = 0; i < 120 * 110 && !r.finished; i++) {
      if (i % 6 === 0) input = drivingInput(v);
      v.step(input);
      r.update(v, STEP);
      if (v.position.y < frame(v.progress).p.y - 18) {
        falls++;
        r.respawn(v);
      }
    }
    console.log("Keyboard simulation", {
      time: r.time,
      progress: v.progress,
      checkpoint: r.nextCheckpoint,
      position: v.position.toArray(),
      speed: v.speed,
      falls,
    });
    expect(r.finished).toBe(true);
  }, 20000);
  it("can complete the course with steering, throttle and braking only", () => {
    const v = new Vehicle(),
      r = new Race();
    let air = 0,
      landings = 0,
      wasAir = false;
    let maxHeight = 0;
    for (let i = 0; i < 120 * 150 && !r.finished; i++) {
      v.step(drivingInput(v, { analog: true }));
      r.update(v, STEP);
      if (!v.grounded) {
        air++;
        wasAir = true;
      } else if (wasAir) {
        landings++;
        wasAir = false;
      }
      maxHeight = Math.max(maxHeight, v.position.y);
      if (v.position.y < frame(v.progress).p.y - 20)
        throw new Error(
          `Fell at progress ${v.progress.toFixed(4)}, time ${r.time.toFixed(2)}, checkpoint ${r.nextCheckpoint}`,
        );
    }
    console.log({
      time: r.time,
      progress: v.progress,
      checkpoints: r.nextCheckpoint,
      air,
      landings,
      maxHeight,
    });
    expect(r.finished).toBe(true);
    expect(landings).toBeGreaterThanOrEqual(2);
    expect(r.time).toBeLessThan(100);
  }, 20000);
});
