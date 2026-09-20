import { describe, expect, it } from "vitest";
import { Vehicle, Race, STEP, interpolatePose, parseRecord } from "../src/sim";
import { frame, TRACK_VERSION, track } from "../src/track";
const coast = { throttle: 0, steer: 0, brake: false };

describe("continuous core gameplay", () => {
  it("carries momentum smoothly past boost expiry instead of clamping to cruising speed", () => {
    const v = new Vehicle();
    v.velocity.copy(v.heading).multiplyScalar(85);
    v.boost = STEP / 2;
    v.step({ ...coast, throttle: 1 });
    expect(v.boost).toBe(0);
    expect(v.speed).toBeGreaterThan(84);
    expect(v.speed).toBeLessThanOrEqual(85);
  });
  it("does not erase momentum when a sideways landing points slightly backward", () => {
    const v = new Vehicle();
    const f = frame(0);
    v.heading.copy(f.right).applyAxisAngle(f.up, -0.05);
    v.velocity.copy(f.forward).multiplyScalar(35);
    v.contactGrip = 0;
    expect(v.velocity.dot(v.heading)).toBeLessThan(0);
    const speed = v.velocity.length();
    v.step(coast);
    expect(v.velocity.length()).toBeGreaterThan(speed - 1);
  });
  it("records the exact start, finish, and both sides of a respawn", () => {
    const v = new Vehicle(),
      r = new Race();
    r.update(v, STEP);
    expect(r.poses[0]?.t).toBe(0);
    v.reset(0.12);
    r.update(v, STEP);
    const before = v.position.clone();
    r.respawn(v);
    const after = v.position.clone();
    expect(
      r.poses.some((p) => p.p.every((n, i) => n === before.getComponent(i))),
    ).toBe(true);
    expect(
      r.poses.some((p) => p.p.every((n, i) => n === after.getComponent(i))),
    ).toBe(true);
    const a = r.poses.at(-2)!,
      b = r.poses.at(-1)!;
    expect(b.cut).toBe(true);
    expect(interpolatePose(a, b, 0).p).toEqual(after.toArray());
    r.nextCheckpoint = track.checkpoints.length;
    r.lastProgress = 0.99999;
    v.reset(0.00001);
    r.update(v, STEP);
    expect(r.finished).toBe(true);
    expect(r.poses.at(-1)?.t).toBe(r.time);
    expect(r.poses.at(-1)?.p).toEqual(v.position.toArray());
  });
  it("holds a ghost until a discontinuity and validates same-time cut samples", () => {
    const a = { t: 1, p: [0, 0, 0], h: [0, 0, -1], u: [0, 1, 0] };
    const b = { ...a, t: 2, p: [100, 0, 0], cut: true };
    expect(interpolatePose(a, b, 0.5).p).toEqual(a.p);
    expect(interpolatePose(a, b, 1).p).toEqual(b.p);
    expect(interpolatePose(a, { ...b, cut: false }, 0.5).p).toEqual([50, 0, 0]);
    const record = {
      version: TRACK_VERSION,
      time: 10,
      splits: track.checkpoints.map((_, i) => (i + 1) * 2),
      poses: [a, { ...b, t: 1 }],
    };
    expect(parseRecord(JSON.stringify(record), TRACK_VERSION)).not.toBeNull();
    expect(
      parseRecord(
        JSON.stringify({ ...record, poses: [a, { ...b, t: 1, cut: false }] }),
        TRACK_VERSION,
      ),
    ).toBeNull();
  });
});

it("interpolates a ghost through half a roll without collapsing its orientation", () => {
  const a = { t: 0, p: [0, 0, 0], h: [0, 0, -1], u: [0, 1, 0] };
  const b = { ...a, t: 1, u: [0, -1, 0] };
  const middle = interpolatePose(a, b, 0.5);
  expect(Math.hypot(...middle.u)).toBeCloseTo(1, 10);
  expect(Math.abs(middle.u[0])).toBeCloseTo(1, 10);
  expect(middle.u.reduce((sum, n, i) => sum + n * middle.h[i], 0)).toBeCloseTo(
    0,
    10,
  );
});
