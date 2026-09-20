import { writeFileSync } from "node:fs";
function requireWrite(runs: unknown) {
  writeFileSync("/tmp/inferno-corner.json", JSON.stringify(runs, null, 2));
}
import { drivingInput } from "./driver";
import { it, expect } from "vitest";
import { Vehicle, STEP } from "../src/sim";
import { nearest, roadWidth, track } from "../src/track";
import { HANDLING as H } from "../src/sim/handling";
// Measured across the corner itself, in its own length: entry, apex and
// exit. Stopping at the apex would time only the part a slide gives away.
const hairpin = track.features!.find((f) => f.kind === "hairpin")!;
const span = hairpin.end - hairpin.start;
it("a clean drift leaves the tight east bend faster than a brake-only approach", () => {
  const runs: {
    time: number;
    exit: number;
    maxSlip: number;
    maxLat: number;
    railClearance: number;
    rails: number;
  }[] = [];
  for (const drift of [false, true])
    for (const start of [hairpin.start + span * 0.05]) {
      const v = new Vehicle();
      v.reset(start);
      v.velocity.copy(v.heading).multiplyScalar(60);
      let maxSlip = 0,
        maxLat = 0,
        railClearance = Infinity,
        rails = 0;
      for (let i = 0; i < 120 * 15; i++) {
        v.step(drivingInput(v, { drift, analog: true }));
        if (v.railContact) rails++;
        maxSlip = Math.max(maxSlip, (Math.abs(v.slipAngle) * 180) / Math.PI);
        const road = nearest(v.position);
        maxLat = Math.max(maxLat, Math.abs(road.lateral));
        railClearance = Math.min(
          railClearance,
          roadWidth(road.t) / 2 - H.chassisHalfWidth - Math.abs(road.lateral),
        );
        if (v.progress > hairpin.end - span * 0.12) {
          runs.push({
            time: (i + 1) * STEP,
            exit: v.speed,
            maxSlip,
            maxLat,
            railClearance,
            rails,
          });
          break;
        }
      }
    }
  expect(runs).toHaveLength(2);
  const [brake, drift] = runs;
  console.log("East bend comparison", { brake, drift });
  requireWrite(runs);
  // A powered slide does not shorten the corner itself. It pays a little on
  // entry and finishes the corner pointed down the next straight, carrying
  // speed the gripping line never builds. Compare the exit, and require that
  // nothing is given away in the corner to get it.
  expect(drift.time).toBeLessThan(brake.time + 0.1);
  expect(drift.exit).toBeGreaterThan(brake.exit + 4);
  expect(drift.maxSlip).toBeGreaterThan(5); // A slide emerges from tire forces; no fixed angle.
  expect(drift.maxSlip).toBeLessThan(35);
  // A powered exit uses more of the road. Require a clear margin from the
  // actual collision boundary rather than prescribing one centreline offset.
  expect(drift.railClearance).toBeGreaterThan(1);
  expect([brake.rails, drift.rails]).toEqual([0, 0]);
});
