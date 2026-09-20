import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { makeCar } from "../src/render/car";
import { Vehicle, HANDLING } from "../src/sim";

describe("wheel animation", () => {
  it.each([false, true])(
    "rolls by signed distance, independently of steering (ghost=%s)",
    (ghost) => {
      const car = makeCar(ghost),
        animation = car.wheelAnimation;
      const position = new Vector3(),
        heading = new Vector3(0, 0, -1);
      animation.update(position, heading);
      position.z = -0.5;
      animation.update(position, heading, -0.12);
      for (const { pivot, rolling, front } of animation.rigs) {
        expect(rolling.rotation.x).toBeCloseTo(-1);
        expect(pivot.rotation.y).toBe(front ? -0.12 : 0);
        expect(pivot.parent).toBe(car);
        expect(rolling.parent).toBe(pivot);
        expect(rolling.children).toHaveLength(6);
        const axle = new Vector3(1, 0, 0)
          .applyQuaternion(rolling.quaternion)
          .applyQuaternion(pivot.quaternion);
        expect(axle.z).toBeCloseTo(front ? Math.sin(0.12) : 0);
      }
      // Pause and lateral/vertical travel do not roll the wheels.
      animation.update(position, heading, 0.08);
      position.set(1, 2, -0.5);
      animation.update(position, heading, 0.08);
      expect(animation.rigs[0].rolling.rotation.x).toBeCloseTo(-1);
      position.z = 0;
      animation.update(position, heading, 0);
      expect(animation.rigs[0].rolling.rotation.x).toBeCloseTo(0);
      animation.reset();
      animation.update(new Vector3(100, 50, 200), heading);
      expect(
        animation.rigs.every(({ rolling }) => rolling.rotation.x === 0),
      ).toBe(true);
    },
  );

  it("uses smoothed, speed-dependent handling steering and resets it", () => {
    const car = new Vehicle();
    car.steering = 1;
    expect(car.steeringAngle).toBeCloseTo(-HANDLING.steeringAngle);
    car.velocity.copy(car.heading).multiplyScalar(HANDLING.steeringSpeedScale);
    expect(car.steeringAngle).toBeCloseTo(-HANDLING.steeringAngle / 2);
    car.steering = -0.5;
    expect(car.steeringAngle).toBeCloseTo(HANDLING.steeringAngle / 4);
    car.reset(0);
    expect(car.steeringAngle).toBeCloseTo(0);
  });
});
