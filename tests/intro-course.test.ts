import { drivingInput } from "./driver";
import { describe, expect, it } from "vitest";
import { Vehicle, Race, STEP, type Input } from "../src/sim";
import { frame, length, nearest, track, roadWidth, inGap } from "../src/track";

function steering(v: Vehicle) {
  return drivingInput(v).steer;
}
const drive: Input = { throttle: 1, brake: false, steer: 0 };
describe("Vertigo Works introduction", () => {
  it("has four timed sectors, two graduated jumps and seven purposeful boosts", () => {
    expect(track.checkpoints).toHaveLength(3);
    expect(track.gaps).toHaveLength(2);
    expect(track.boosts).toHaveLength(7);
    expect(length).toBeGreaterThan(2400);
    expect(length).toBeLessThan(3500);
    const jumps = track.gaps.map(([a, b]) => (b - a) * length);
    expect(jumps[0]).toBeGreaterThan(10);
    expect(jumps[0]).toBeLessThan(14);
    expect(jumps[1]).toBeGreaterThan(jumps[0] * 1.5);
    expect(jumps[1]).toBeLessThan(23);
    expect(track.boosts[0]).toBeLessThan(track.features![0].start);
    expect(track.boosts[1]).toBeCloseTo(track.features![0].end);
    expect(track.boosts[5]).toBeGreaterThan(track.checkpoints[2]);
    expect(track.boosts[5]).toBeLessThan(track.gaps[1][0]);
    expect(track.boosts[6]).toBeGreaterThan(0.94);
    expect(
      roadWidth(
        track.features!.find((f) => f.kind === "hairpin")!.start + 0.03,
      ),
    ).toBeGreaterThanOrEqual(25);
    for (const cp of track.checkpoints) expect(inGap(cp)).toBe(false);
  });
  it.each([6, 12, 18])(
    "lets a beginner hold throttle through the first sector at %s-tick steering cadence",
    (cadence) => {
      const v = new Vehicle();
      let steer = 0,
        contacts = 0,
        boostEntries = 0;
      for (let i = 0; i < 120 * 25 && v.progress < track.checkpoints[0]; i++) {
        if (i % cadence === 0) steer = steering(v);
        const previousBoost = v.boost;
        v.step({ ...drive, steer });
        if (v.boost > previousBoost) boostEntries++;
        contacts += Number(v.railContact);
        expect(v.grounded).toBe(true);
      }
      console.log("Opening", {
        cadence,
        progress: v.progress,
        contacts,
        boostEntries,
      });
      expect(v.progress).toBeGreaterThanOrEqual(track.checkpoints[0]);
      expect(contacts).toBe(0);
      expect(boostEntries).toBe(2);
    },
  );
  it.each([
    [0, 25],
    [0, 35],
    [0, 49],
    [0, 65],
    [1, 32],
    [1, 40],
    [1, 58],
    [1, 72],
    [0, 85],
    [0, 94],
    [1, 85],
    [1, 94],
  ])(
    "jump %s safely accepts a %s m/s approach without requiring a boost",
    (index, speed) => {
      for (const offset of [-3, 0, 3]) {
        const v = new Vehicle(),
          [a, b] = track.gaps[index];
        v.reset(a - 0.001);
        const f = frame(v.progress);
        v.position.addScaledVector(f.right, offset);
        v.velocity.copy(v.heading).multiplyScalar(speed);
        let air = false,
          landed = false,
          takeoff = 0;
        for (let i = 0; i < 240; i++) {
          const wasGrounded = v.grounded;
          v.step({ ...drive, throttle: 0 });
          if (wasGrounded && !v.grounded) {
            air = true;
            takeoff = v.speed;
          }
          if (air && v.grounded) {
            landed = true;
            break;
          }
          if (v.position.y < frame(v.progress).p.y - 10) break;
        }
        console.log("Jump", {
          index,
          speed,
          offset,
          takeoff,
          landed,
          progress: v.progress,
        });
        expect(air).toBe(true);
        expect(landed).toBe(true);
        expect(v.progress).toBeGreaterThan(b);
        expect(v.railContact).toBe(false);
        expect(Math.abs(nearest(v.position).lateral)).toBeLessThan(
          roadWidth(v.progress) / 2 - 2,
        );
      }
    },
  );
  it("is finishable at a cautious 55 m/s target without drifting or falls", () => {
    const v = new Vehicle(),
      r = new Race(v);
    let input = drive,
      air = false,
      landings = 0,
      contacts = 0;
    for (let i = 0; i < 120 * 120 && !r.finished; i++) {
      if (i % 12 === 0) input = drivingInput(v, { cautious: true });
      v.step(input);
      r.update(v, STEP);
      contacts += Number(v.railContact);
      if (!v.grounded) air = true;
      else if (air) {
        landings++;
        air = false;
      }
      expect(v.position.distanceTo(frame(v.progress).p)).toBeLessThan(50);
    }
    console.log("Cautious lap", {
      time: r.time,
      finish: r.finished,
      landings,
      contacts,
    });
    expect(r.finished).toBe(true);
    expect(landings).toBe(2);
    expect(contacts).toBe(0);
  });
});
