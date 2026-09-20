import { HANDLING } from "../sim/handling";
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  DoubleSide,
} from "three";
import { nearest, inGap, roadWidth } from "../track";
import { inkColor } from "./ink";
import type { Vehicle } from "../sim";

/** Tire marks from a slide or boost. The fixed pool draws in one call.
 * The edges are hard, so no colour outside the three inks can appear. */
export class TireTrails {
  private capacity = 512;
  private positions = new Float32Array(this.capacity * 18);
  private colors = new Float32Array(this.capacity * 18);
  private signal = inkColor("green");
  private structure = inkColor("red");
  private life = new Float32Array(this.capacity);
  private previous: Vector3[] | null = null;
  private serial = -1;
  private cursor = 0;
  private clock = 0;
  mesh: Mesh;
  constructor() {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new BufferAttribute(this.colors, 3));
    this.mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        vertexColors: true,
        side: DoubleSide,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    this.mesh.frustumCulled = false;
  }
  clear() {
    this.previous = null;
    this.life.fill(0);
    this.positions.fill(0);
    this.clock = 0;
    this.cursor = 0;
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
  update(car: Vehicle, dt: number) {
    if (this.serial !== car.resetSerial) {
      this.clear();
      this.serial = car.resetSerial;
    }
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) this.positions.fill(0, i * 18, i * 18 + 18);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    if (
      !car.grounded ||
      car.rearLoad <= 0 ||
      (car.slipIntensity < 0.15 && car.boost <= 0)
    ) {
      this.previous = null;
      return;
    }
    this.clock += dt;
    if (this.clock < 1 / 30) return;
    this.clock = 0;
    const right = car.heading.clone().cross(car.up).normalize();
    const points = [-1, 1].map((side, wheel) => {
      if (!(car.contactMask & (1 << (wheel + 2)))) return null;
      const p = car.position
        .clone()
        .addScaledVector(car.heading, -HANDLING.wheelRear)
        .addScaledVector(right, side * HANDLING.wheelHalfWidth);
      const road = nearest(p);
      if (inGap(road.t) || Math.abs(road.lateral) > roadWidth(road.t) / 2)
        return null;
      return p.addScaledVector(road.up, 0.035 - road.height);
    });
    if (!points[0] || !points[1]) {
      this.previous = null;
      return;
    }
    const current = points as Vector3[];
    if (this.previous)
      for (let wheel = 0; wheel < 2; wheel++) {
        const a = this.previous[wheel],
          b = current[wheel];
        if (a.distanceTo(b) > 4 || a.distanceToSquared(b) < 0.0001) continue;
        const width = b
          .clone()
          .sub(a)
          .cross(nearest(b).up)
          .normalize()
          .multiplyScalar(0.12);
        const vertices = [
          a.clone().sub(width),
          a.clone().add(width),
          b.clone().add(width),
          a.clone().sub(width),
          b.clone().add(width),
          b.clone().sub(width),
        ];
        const color = car.boost > 0 ? this.signal : this.structure;
        vertices.forEach((v, i) => {
          const offset = this.cursor * 18 + i * 3;
          v.toArray(this.positions, offset);
          color.toArray(this.colors, offset);
        });
        this.mesh.geometry.attributes.color.needsUpdate = true;
        this.life[this.cursor] = 3;
        this.cursor = (this.cursor + 1) % this.capacity;
      }
    this.previous = current;
  }
}
