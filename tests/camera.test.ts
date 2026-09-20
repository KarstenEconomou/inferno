import { describe, it, expect } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
} from "three";
import {
  CameraController,
  cameraSettings,
  type CameraPreset,
} from "../src/render/camera";
import { CameraObstructions } from "../src/render/obstructions";
import { frame, track } from "../src/track";
import { Vehicle, STEP } from "../src/sim";
import { drivingInput } from "./driver";
describe("camera presets", () => {
  it("validates saved settings and uses Inferno framing defaults", () => {
    expect(cameraSettings(null)).toEqual({
      preset: 0,
      fov: 70,
      speedFov: false,
    });
    expect(cameraSettings({ preset: 9, fov: Infinity, speedFov: 1 })).toEqual({
      preset: 0,
      fov: 70,
      speedFov: false,
    });
    expect(cameraSettings({ preset: 2, fov: 99, speedFov: true })).toEqual({
      preset: 2,
      fov: 85,
      speedFov: true,
    });
    const v = new Vehicle(),
      c = new CameraController();
    c.update(v, STEP);
    expect(
      c.position.distanceTo(
        v.position
          .clone()
          .addScaledVector(v.heading, -12)
          .addScaledVector(v.up, 5),
      ),
    ).toBeLessThan(1e-10);
  });
  it.each([0, 1, 2] as CameraPreset[])(
    "keeps preset %s and continuous quaternions through every road frame",
    (preset) => {
      const c = new CameraController();
      c.preset = preset;
      const v = new Vehicle();
      for (let i = 0; i < 6000; i++) {
        const f = frame(i / 6000);
        v.position.copy(f.p).addScaledVector(f.up, 0.65);
        v.heading.copy(f.forward);
        v.up.copy(f.up);
        v.velocity.copy(v.heading).multiplyScalar(70);
        const before = c.rotation.clone();
        c.update(v, STEP);
        expect(c.preset).toBe(preset);
        expect(c.rotation.length()).toBeCloseTo(1, 10);
        if (
          i > 0 &&
          !track.gaps.some(
            ([a, b]) =>
              Math.min(Math.abs(i / 6000 - a), Math.abs(i / 6000 - b)) < 0.002,
          )
        )
          expect(before.angleTo(c.rotation)).toBeLessThan(0.15);
      }
    },
  );
  it("Overview holds launch reference; Close and Interior follow flight rotation", () => {
    const v = new Vehicle(),
      controllers = [0, 1, 2].map((p) => {
        const c = new CameraController();
        c.preset = p as CameraPreset;
        c.update(v, STEP);
        return c;
      });
    const before = controllers.map((c) => c.rotation.clone());
    v.grounded = false;
    v.up.applyAxisAngle(v.heading, Math.PI / 2);
    for (let i = 0; i < 120; i++) controllers.forEach((c) => c.update(v, STEP));
    // Held exactly; the residual is the last bits of the launch quaternion.
    expect(controllers[0].rotation.angleTo(before[0])).toBeLessThan(1e-6);
    expect(controllers[1].rotation.angleTo(before[1])).toBeGreaterThan(1);
    expect(controllers[2].rotation.angleTo(before[2])).toBeCloseTo(
      Math.PI / 2,
      8,
    );
    v.grounded = true;
    controllers[0].update(v, STEP);
    expect(controllers[0].rotation.angleTo(before[0])).toBeLessThan(0.1);
  });
  it.each([0, 1, 2] as CameraPreset[])(
    "has identical %s camera state at 30/60/120 Hz rendering and immediate reset",
    (preset) => {
      const run = (fps: number) => {
        const c = new CameraController(),
          v = new Vehicle(),
          camera = new PerspectiveCamera();
        c.preset = preset;
        let acc = 0,
          tick = 0;
        let input = drivingInput(v);
        for (let i = 0; i < fps * 52; i++) {
          acc += 1 / fps;
          while (acc >= STEP - 1e-10) {
            if (tick % 6 === 0) input = drivingInput(v);
            v.step(input);
            c.update(v, STEP);
            tick++;
            acc -= STEP;
          }
          c.apply(camera, Math.max(0, acc / STEP));
        }
        return { c, v, camera };
      };
      const a = run(30);
      for (const fps of [60, 120]) {
        const b = run(fps);
        expect(a.c.position.distanceTo(b.c.position)).toBeLessThan(1e-9);
        expect(a.camera.position.distanceTo(b.camera.position)).toBeLessThan(
          1e-8,
        );
        expect(a.c.rotation.angleTo(b.c.rotation)).toBeLessThan(1e-7);
      }
      a.v.reset(0);
      a.c.reset();
      a.c.update(a.v, STEP);
      a.c.apply(a.camera, 0);
      expect(a.camera.position.distanceTo(a.c.position)).toBe(0);
      expect(a.c.preset).toBe(preset);
    },
  );
  it("sweeps both sides of decks and mounted structures, shortening promptly and restoring smoothly", () => {
    const root = new Group(),
      deck = new Mesh(new BoxGeometry(30, 1, 30), new MeshBasicMaterial());
    deck.position.y = -0.5;
    root.add(deck);
    const wall = new Mesh(new BoxGeometry(10, 8, 0.5), new MeshBasicMaterial());
    wall.position.set(0, 4, 5);
    root.add(wall);
    const obstacles = new CameraObstructions(root);
    expect(
      obstacles.sweep(new Vector3(0, 3, 0), new Vector3(0, -3, 0)),
    ).toBeLessThan(0.5);
    expect(
      obstacles.sweep(new Vector3(0, -3, 0), new Vector3(0, 3, 0)),
    ).toBeLessThan(0.5);
    let fraction = 1;
    const c = new CameraController(() => fraction),
      v = new Vehicle();
    c.update(v, STEP);
    const full = c.position.distanceTo(v.position);
    fraction = 0.3;
    c.update(v, STEP);
    const short = c.position.distanceTo(v.position);
    expect(short).toBeLessThan(full * 0.5);
    fraction = 1;
    c.update(v, STEP);
    expect(c.position.distanceTo(v.position)).toBeLessThan(full * 0.6);
    expect(
      obstacles.sweep(new Vector3(0, 1, 0), new Vector3(0, 5, 12)),
    ).toBeLessThan(0.5);
  });
});
it.each([0, 1, 2] as CameraPreset[])(
  "keeps preset %s continuous while a crash spins the chassis",
  (preset) => {
    const v = new Vehicle(),
      c = new CameraController();
    c.preset = preset;
    c.update(v, STEP);
    v.grounded = false;
    for (let i = 0; i < 480; i++) {
      const before = c.rotation.clone();
      const axis = new Vector3(0.3, 0.4, 0.8).normalize();
      v.heading.applyAxisAngle(axis, 0.05);
      v.up.applyAxisAngle(axis, 0.05);
      v.position.addScaledVector(v.heading, 0.1);
      c.update(v, STEP);
      expect(c.rotation.angleTo(before)).toBeLessThan(0.1);
      expect(c.preset).toBe(preset);
    }
  },
);
