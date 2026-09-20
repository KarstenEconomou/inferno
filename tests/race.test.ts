import { describe, expect, it } from "vitest";
import { Vehicle, interpolatePose, parseRecord, Race, STEP } from "../src/sim";
import {
  interpolatePose as interpolatePoseDirect,
  parseRecord as parseRecordDirect,
  Race as RaceDirect,
  type Pose,
} from "../src/sim/race";
import {
  frame,
  length,
  roadWidth,
  track,
  TRACK_VERSION,
  wrap,
} from "../src/track";

describe("checkpoint crossings", () => {
  function approach(
    gate: number,
    height: number,
    lateral = 0,
    reverse = false,
  ) {
    const car = new Vehicle(),
      f = frame(gate);
    car.reset(wrap(gate + (reverse ? 2 : -2) / length));
    car.position
      .copy(f.p)
      .addScaledVector(f.forward, reverse ? 2 : -2)
      .addScaledVector(f.up, height)
      .addScaledVector(f.right, lateral);
    car.velocity.copy(f.forward).multiplyScalar(reverse ? -40 : 40);
    car.grounded = false;
    return car;
  }
  function cross(car: Vehicle, race: Race) {
    for (let i = 0; i < 18; i++) {
      car.step({ throttle: 0, steer: 0, brake: false });
      race.update(car, STEP);
    }
  }
  it.each([3, 12])(
    "credits jumps %s m above the deck at every checkpoint",
    (height) => {
      track.checkpoints.forEach((gate, index) => {
        const car = approach(gate, height),
          race = new Race(car);
        race.nextCheckpoint = index;
        cross(car, race);
        expect(car.grounded).toBe(false);
        expect(race.nextCheckpoint).toBe(index + 1);
        expect(race.splits).toHaveLength(1);
        cross(car, race);
        expect(race.splits).toHaveLength(1);
      });
    },
  );
  it("rejects airborne passes beside, below, backward through, or out of checkpoint order", () => {
    const gate = track.checkpoints[0];
    for (const car of [
      approach(gate, 12, roadWidth(gate) / 2 + 2),
      approach(gate, -3),
      approach(gate, 12, 0, true),
      approach(track.checkpoints[1], 12),
    ]) {
      const race = new Race(car);
      cross(car, race);
      expect(race.nextCheckpoint).toBe(0);
      expect(race.splits).toHaveLength(0);
    }
  });
  it("credits an airborne finish only after every checkpoint", () => {
    for (const complete of [false, true]) {
      const car = approach(0, 12),
        race = new Race(car);
      if (complete) race.nextCheckpoint = track.checkpoints.length;
      cross(car, race);
      expect(race.finished).toBe(complete);
    }
  });
});

describe("race module extraction compatibility", () => {
  it("re-exports the identical race surface from sim.ts", async () => {
    const sim = await import("../src/sim");
    expect(sim.Race).toBe(RaceDirect);
    expect(sim.parseRecord).toBe(parseRecordDirect);
    expect(sim.interpolatePose).toBe(interpolatePoseDirect);
  });

  it("samples a pose every 1/30s and replaces a same-tick sample", () => {
    const v = new Vehicle();
    const r = new Race(v);
    expect(r.poses).toHaveLength(1);
    expect(r.poses[0].t).toBe(0);
    for (let i = 0; i < 120; i++) {
      v.step({ throttle: 1, steer: 0, brake: false });
      r.update(v, 1 / 120);
    }
    expect(r.time).toBeCloseTo(1, 10);
    for (const g of r.poses.slice(1).map((p, i) => p.t - r.poses[i].t))
      expect(g).toBeGreaterThan(1 / 30 - 1e-9);
    expect(r.poses.at(-1)!.p).toEqual(v.position.toArray());
    expect(r.poses.at(-1)!.h).toEqual(v.heading.toArray());
    expect(r.poses.at(-1)!.u).toEqual(v.up.toArray());
    expect(r.poses.at(-1)!.steeringAngle).toBe(v.steeringAngle);
  });

  it("records a respawn as back-to-back poses with a cut on the second", () => {
    const v = new Vehicle();
    const r = new Race(v);
    for (let i = 0; i < 200; i++) {
      v.step({ throttle: 1, steer: 0, brake: false });
      r.update(v, 1 / 120);
    }
    const count = r.poses.length;
    const time = r.time;
    const pre = v.position.clone();
    r.respawn(v);
    expect(v.speed).toBe(0);
    expect(r.poses.length).toBeGreaterThanOrEqual(count);
    expect(r.time).toBe(time);
    const cut = r.poses.at(-1)!;
    const prior = r.poses.at(-2)!;
    expect(cut.cut).toBe(true);
    expect(prior.cut).toBeUndefined();
    expect(cut.p).toEqual(v.position.toArray());
    expect(prior.p).toEqual(pre.toArray());
    expect(prior.t).toBe(cut.t);
    expect(cut.t).toBe(r.time);
  });
});

describe("ghost interpolation semantics", () => {
  const a: Pose = { t: 1, p: [0, 0, 0], h: [0, 0, -1], u: [0, 1, 0] };
  const b: Pose = { t: 2, p: [10, 0, 0], h: [0, 0, -1], u: [0, 1, 0] };
  it("clamps alpha outside [0, 1] for continuous segments", () => {
    expect(interpolatePose(a, b, -0.5).p).toEqual(a.p);
    expect(interpolatePose(a, b, 1.5).p).toEqual(b.p);
  });
  it("holds the previous pose until a cut, then snaps at or past its sample", () => {
    const cut = { ...b, cut: true };
    expect(interpolatePose(a, cut, 0).p).toEqual(a.p);
    expect(interpolatePose(a, cut, 0.99).p).toEqual(a.p);
    expect(interpolatePose(a, cut, 1).p).toEqual(cut.p);
  });
  it("lerps position and slerps orientation for continuous segments", () => {
    const mid = interpolatePose(a, b, 0.25);
    expect(mid.p).toEqual([2.5, 0, 0]);
    expect(mid.t).toBeCloseTo(1.25, 10);
  });
  it("interpolates steering, centers old recordings and respects cuts", () => {
    const left = { ...a, steeringAngle: 0.12 };
    const right = { ...b, steeringAngle: -0.08 };
    expect(interpolatePose(left, right, 0.5).steeringAngle).toBeCloseTo(0.02);
    expect(interpolatePose(a, b, 0.5).steeringAngle).toBe(0);
    expect(
      interpolatePose(left, { ...right, cut: true }, 0.9).steeringAngle,
    ).toBe(0.12);
    expect(
      interpolatePose(left, { ...right, cut: true }, 1).steeringAngle,
    ).toBe(-0.08);
  });
  it("keeps orientation orthonormal through a half roll", () => {
    const end: Pose = { ...a, t: 1, u: [0, -1, 0] };
    const mid = interpolatePose(a, end, 0.5);
    expect(Math.hypot(...mid.u)).toBeCloseTo(1, 10);
    expect(mid.u.reduce((sum, n, i) => sum + n * mid.h[i], 0)).toBeCloseTo(
      0,
      10,
    );
  });
});

describe("parseRecord validation", () => {
  const pose = { t: 1, p: [0, 0, 0], h: [0, 0, -1], u: [0, 1, 0] };
  const valid = {
    version: TRACK_VERSION,
    time: 60,
    splits: track.checkpoints.map((_, i) => (i + 1) * 10),
    poses: [pose, { ...pose, t: 2 }],
  };
  it("accepts a well-formed record", () => {
    expect(parseRecord(JSON.stringify(valid), TRACK_VERSION)).not.toBeNull();
  });
  it("accepts optional steering and rejects malformed steering angles", () => {
    for (const steeringAngle of [0.12, "left", null]) {
      const record = {
        ...valid,
        poses: valid.poses.map((p) => ({ ...p, steeringAngle })),
      };
      expect(parseRecord(JSON.stringify(record), TRACK_VERSION) !== null).toBe(
        steeringAngle === 0.12,
      );
    }
  });
  it("rejects null, broken JSON and version mismatches", () => {
    expect(parseRecord(null, TRACK_VERSION)).toBeNull();
    expect(parseRecord("{broken", TRACK_VERSION)).toBeNull();
    expect(
      parseRecord(JSON.stringify({ ...valid, version: "old" }), TRACK_VERSION),
    ).toBeNull();
  });
  it("rejects non-positive, non-finite and unordered splits", () => {
    expect(
      parseRecord(
        JSON.stringify({ ...valid, splits: valid.splits.map((s) => -s) }),
        TRACK_VERSION,
      ),
    ).toBeNull();
    expect(
      parseRecord(
        JSON.stringify({ ...valid, splits: [...valid.splits.slice(0, -1), 0] }),
        TRACK_VERSION,
      ),
    ).toBeNull();
  });
  it("rejects wrong split counts", () => {
    expect(
      parseRecord(JSON.stringify({ ...valid, splits: [] }), TRACK_VERSION),
    ).toBeNull();
  });
  it("rejects poses outside the recorded time window", () => {
    expect(
      parseRecord(
        JSON.stringify({ ...valid, poses: [pose, { ...pose, t: 61 }] }),
        TRACK_VERSION,
      ),
    ).toBeNull();
  });
  it("rejects non-monotonic continuous poses but allows equal-time cuts", () => {
    expect(
      parseRecord(
        JSON.stringify({ ...valid, poses: [pose, { ...pose, t: 1 }] }),
        TRACK_VERSION,
      ),
    ).toBeNull();
    expect(
      parseRecord(
        JSON.stringify({
          ...valid,
          poses: [pose, { ...pose, t: 1, cut: true }],
        }),
        TRACK_VERSION,
      ),
    ).not.toBeNull();
  });
  it("rejects non-finite or malformed vectors", () => {
    expect(
      parseRecord(
        JSON.stringify({
          ...valid,
          poses: [pose, { ...pose, t: 2, p: [NaN, 0, 0] }],
        }),
        TRACK_VERSION,
      ),
    ).toBeNull();
  });
});
