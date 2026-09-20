import { Box3, Group } from "three";
import { describe, expect, it } from "vitest";
import { buildBoostPads } from "../src/render/environment/markings";
import { BOOST_PAD_BOUNDS } from "../src/track/markers";
import { frame, track } from "../src/track";
import { HANDLING, STEP, Vehicle } from "../src/sim";

const coast = { throttle: 0, steer: 0, brake: false };

describe("boost pad footprint", () => {
  it("uses the exact bounding rectangle of the rendered chevrons", () => {
    const root = new Group();
    buildBoostPads(root);
    expect(root.children).toHaveLength(track.boosts.length);
    for (const pad of root.children) {
      pad.position.set(0, 0, 0);
      pad.quaternion.identity();
      const box = new Box3().setFromObject(pad);
      expect(box.max.x).toBeCloseTo(BOOST_PAD_BOUNDS.halfWidth, 6);
      expect(box.min.x).toBeCloseTo(-BOOST_PAD_BOUNDS.halfWidth, 6);
      expect(box.max.z).toBeCloseTo(BOOST_PAD_BOUNDS.halfLength, 6);
      expect(box.min.z).toBeCloseTo(-BOOST_PAD_BOUNDS.halfLength, 6);
    }
  });

  it.each(track.boosts)(
    "activates inside, but never beside or beyond, pad %s",
    (t) => {
      const f = frame(t);
      for (const [axis, limit] of [
        [f.right, BOOST_PAD_BOUNDS.halfWidth],
        [f.forward, BOOST_PAD_BOUNDS.halfLength],
      ] as const) {
        for (const side of [-1, 1]) {
          for (const margin of [-0.12, 0.12]) {
            const car = new Vehicle();
            car.reset(t);
            car.position.addScaledVector(axis, side * (limit + margin));
            car.velocity.copy(car.heading).multiplyScalar(55);
            car.step(coast);
            expect(
              car.grounded,
              JSON.stringify({
                t,
                axis: axis.toArray(),
                side,
                margin,
                load: car.normalLoad,
              }),
            ).toBe(true);
            expect(car.boost > 0).toBe(margin < 0);
          }
        }
      }
    },
  );

  it("checks current contact before activating a pad", () => {
    for (const grounded of [true, false]) {
      const car = new Vehicle(),
        t = track.boosts[0];
      car.reset(t);
      car.position.addScaledVector(frame(t).up, 10);
      car.grounded = grounded;
      car.step(coast);
      expect(car.grounded).toBe(false);
      expect(car.boost).toBe(0);
    }
  });

  it("catches a fast crossing once and refreshes only after re-entry", () => {
    const car = new Vehicle(),
      t = track.boosts[0],
      f = frame(t);
    car.reset(t);
    car.position.addScaledVector(f.forward, -BOOST_PAD_BOUNDS.halfLength - 1);
    car.velocity.copy(f.forward).multiplyScalar(94);
    let entries = 0;
    for (let i = 0; i < 25; i++) {
      const boost = car.boost;
      car.step(coast, STEP);
      if (car.boost > boost) entries++;
    }
    expect(entries).toBe(1);
    expect(car.boost).toBeLessThan(HANDLING.boostDuration);
    car.position.copy(f.p).addScaledVector(f.up, HANDLING.clearance);
    car.step(coast);
    expect(car.boost).toBe(HANDLING.boostDuration);
  });
});
