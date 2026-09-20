import { drivingInput } from "./driver";
import { HANDLING as H } from "../src/sim/handling";
import { it, expect } from "vitest";
import { Vehicle, Race, STEP, type Input } from "../src/sim";
import { frame, length, nearest } from "../src/track";
/** Six complete laps of a 3.45 km course at 120 Hz is a quarter of a million
 * simulation steps. It is a long test by nature, and it says so rather than
 * running against the default limit for a unit test. */
const LAPS = 30_000;
it(
  "completes with 50–150 ms keyboard decisions, with or without drifting",
  () => {
    for (const drift of [false, true])
      for (const cadence of [6, 12, 18]) {
        const v = new Vehicle(),
          r = new Race(v);
        let input: Input = { throttle: 1, steer: 0, brake: false },
          falls = 0,
          air = false,
          landings = 0,
          rails = 0,
          peakSlip = 0,
          maxSpeedLoss = 0;
        for (let i = 0; i < 120 * 130 && !r.finished; i++) {
          if (i % cadence === 0) input = drivingInput(v, { drift });
          const speed = v.velocity.length();
          v.step(input);
          r.update(v, STEP);
          if (v.grounded && !air)
            maxSpeedLoss = Math.max(maxSpeedLoss, speed - v.velocity.length());
          if (!v.grounded) air = true;
          else if (air) {
            landings++;
            air = false;
          }
          if (v.railContact) rails++;
          if (v.driftPhase === "drift")
            peakSlip = Math.max(
              peakSlip,
              (Math.abs(v.slipAngle) * 180) / Math.PI,
            );
          if (v.position.distanceTo(frame(v.progress).p) > 65) {
            falls++;
            r.respawn(v);
          }
        }
        expect(r.finished).toBe(true);
        expect(falls).toBe(0);
        expect(landings).toBe(2);
        expect(rails).toBe(0);
        expect(maxSpeedLoss).toBeLessThan(
          (H.braking +
            H.gravity +
            H.rollingDrag +
            H.aeroDrag * H.boostSpeed ** 2) *
            STEP +
            0.1,
        ); // m/s lost per tick; no invisible speed clamps.
        if (drift) expect(peakSlip).toBeLessThan(35);
        console.log({
          drift,
          cadence,
          time: r.time,
          falls,
          landings,
          rails,
          peakSlip,
          maxSpeedLoss,
        });
      }
  },
  LAPS,
);
it("completes a controller-equivalent analog lap with both jumps and all checkpoints", () => {
  const v = new Vehicle(),
    r = new Race(v);
  let input = drivingInput(v, { analog: true }),
    air = false,
    landings = 0,
    rails = 0;
  for (let i = 0; i < 120 * 90 && !r.finished; i++) {
    if (i % 6 === 0) input = drivingInput(v, { analog: true, drift: true });
    v.step(input);
    r.update(v, STEP);
    if (air && v.grounded) landings++;
    air = !v.grounded;
    if (v.railContact) rails++;
  }
  expect(r.finished).toBe(true);
  expect(r.nextCheckpoint).toBe(3);
  expect(landings).toBe(2);
  expect(rails).toBe(0);
});
