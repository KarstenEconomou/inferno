import { describe, expect, it } from "vitest";
import { Vehicle } from "../src/sim";
import { TireTrails } from "../src/render/trails";
import { inkColor } from "../src/render/ink";

describe("boost and slide tire tracks", () => {
  const move = (car: Vehicle, trails: TireTrails) => {
    car.position.addScaledVector(car.heading, 0.4);
    trails.update(car, 1 / 30);
  };
  const positions = (trails: TireTrails) =>
    trails.mesh.geometry.attributes.position.array;
  const color = (trails: TireTrails, segment: number) =>
    Array.from(
      trails.mesh.geometry.attributes.color.array.slice(
        segment * 18,
        segment * 18 + 3,
      ),
    );
  const ink = (name: "red" | "green") =>
    Array.from(new Float32Array(inkColor(name).toArray()));

  it("emits signal tracks with boost alone and retains previous segment colors", () => {
    const car = new Vehicle(),
      trails = new TireTrails();
    car.boost = 1;
    move(car, trails);
    move(car, trails);
    expect(positions(trails).some((v) => v !== 0)).toBe(true);
    expect(color(trails, 0)).toEqual(ink("green"));
    car.boost = 0;
    car.slipIntensity = 0.5;
    move(car, trails);
    expect(color(trails, 2)).toEqual(ink("red"));
    expect(color(trails, 0)).toEqual(ink("green"));
    car.boost = 1;
    move(car, trails);
    expect(color(trails, 4)).toEqual(ink("green"));
    expect(color(trails, 2)).toEqual(ink("red"));
  });

  it("breaks tracks when contact is lost, expires them, and clears on respawn", () => {
    const car = new Vehicle(),
      trails = new TireTrails();
    car.boost = 1;
    move(car, trails);
    move(car, trails);
    const before = Array.from(positions(trails));
    car.grounded = false;
    move(car, trails);
    car.grounded = true;
    car.contactMask = 3;
    move(car, trails);
    expect(Array.from(positions(trails))).toEqual(before);
    car.contactMask = 15;
    move(car, trails);
    expect(Array.from(positions(trails))).toEqual(before);
    car.boost = 0;
    trails.update(car, 3.1);
    expect(positions(trails).every((v) => v === 0)).toBe(true);
    car.boost = 1;
    move(car, trails);
    move(car, trails);
    expect(positions(trails).some((v) => v !== 0)).toBe(true);
    car.reset(0);
    trails.update(car, 1 / 30);
    expect(positions(trails).every((v) => v === 0)).toBe(true);
  });
});
