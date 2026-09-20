import { Box3, Mesh, Object3D, Ray, Vector3 } from "three";

/** Fraction of the requested distance that stays clear, from 0 to 1. */
export type ObstructionSweep = (start: Vector3, end: Vector3) => number;

/** Side of one grid cell, in metres. */
const CELL = 24;
/** Half-width of the swept bundle, in metres. */
const CLEARANCE = 0.45;
/** Rays placed around the centre ray. They give the sweep a real width. */
const BUNDLE = 8;
/** Numbers per stored triangle: three vertices of three coordinates. */
const STRIDE = 9;
/** Cell indexes are packed into one integer key. The span covers a course
 * far larger than any authored circuit. */
const KEY_SPAN = 1024;
const KEY_ORIGIN = KEY_SPAN / 2;
const cellKey = (x: number, y: number, z: number) =>
  ((x + KEY_ORIGIN) * KEY_SPAN + (y + KEY_ORIGIN)) * KEY_SPAN +
  (z + KEY_ORIGIN);

/** Static triangle grid, built from the race architecture before the renderer
 * batches it. A small bundle of two-sided rays sweeps the camera clearance,
 * including rails, deck underside, gantries and supports. City animation and
 * cars are not included.
 *
 * The course holds several hundred thousand triangles, so vertices live in one
 * flat array of doubles rather than in objects. */
export class CameraObstructions {
  private cells = new Map<number, number[]>();
  private vertices: Float64Array;
  private count = 0;

  constructor(root: Object3D) {
    root.updateMatrixWorld(true);
    let capacity = 0;
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const position = object.geometry.getAttribute("position");
      if (position)
        capacity += (object.geometry.index?.count ?? position.count) / 3;
    });
    this.vertices = new Float64Array(Math.ceil(capacity) * STRIDE);
    const vertex = new Vector3();
    const data = this.vertices;
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const position = object.geometry.getAttribute("position"),
        index = object.geometry.index;
      if (!position) return;
      for (let i = 0; i < (index?.count ?? position.count); i += 3) {
        const at = this.count++ * STRIDE;
        for (let j = 0; j < 3; j++) {
          vertex
            .fromBufferAttribute(position, index ? index.getX(i + j) : i + j)
            .applyMatrix4(object.matrixWorld);
          vertex.toArray(data, at + j * 3);
        }
        this.insert(
          at / STRIDE,
          Math.min(data[at], data[at + 3], data[at + 6]),
          Math.min(data[at + 1], data[at + 4], data[at + 7]),
          Math.min(data[at + 2], data[at + 5], data[at + 8]),
          Math.max(data[at], data[at + 3], data[at + 6]),
          Math.max(data[at + 1], data[at + 4], data[at + 7]),
          Math.max(data[at + 2], data[at + 5], data[at + 8]),
        );
      }
    });
  }

  /** Record a triangle in every cell that its bounds touch. */
  private insert(
    id: number,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ) {
    for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++)
      for (let y = Math.floor(minY / CELL); y <= Math.floor(maxY / CELL); y++)
        for (
          let z = Math.floor(minZ / CELL);
          z <= Math.floor(maxZ / CELL);
          z++
        ) {
          const key = cellKey(x, y, z);
          const cell = this.cells.get(key);
          if (cell) cell.push(id);
          else this.cells.set(key, [id]);
        }
  }

  /** Collect every triangle whose cell meets the given box. */
  private candidatesIn(box: Box3, found: Set<number>) {
    for (
      let x = Math.floor(box.min.x / CELL);
      x <= Math.floor(box.max.x / CELL);
      x++
    )
      for (
        let y = Math.floor(box.min.y / CELL);
        y <= Math.floor(box.max.y / CELL);
        y++
      )
        for (
          let z = Math.floor(box.min.z / CELL);
          z <= Math.floor(box.max.z / CELL);
          z++
        )
          for (const id of this.cells.get(cellKey(x, y, z)) ?? [])
            found.add(id);
  }

  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();
  private point = new Vector3();
  private origin = new Vector3();
  private ray = new Ray();
  private searchBounds = new Box3();

  /** Sweep a bundle of rays and report the clear fraction of the distance. */
  sweep: ObstructionSweep = (start, end) => {
    const direction = end.clone().sub(start),
      distance = direction.length();
    if (distance < 1e-6) return 1;
    direction.divideScalar(distance);
    const right = direction
      .clone()
      .cross(
        Math.abs(direction.y) < 0.9
          ? new Vector3(0, 1, 0)
          : new Vector3(1, 0, 0),
      )
      .normalize();
    const up = right.clone().cross(direction).normalize();
    const candidates = new Set<number>();
    this.candidatesIn(
      this.searchBounds.setFromPoints([start, end]).expandByScalar(CLEARANCE),
      candidates,
    );
    let closest = distance;
    for (let i = -1; i < BUNDLE; i++) {
      const origin = this.origin.copy(start);
      if (i >= 0)
        origin
          .addScaledVector(right, Math.cos((i * Math.PI) / 4) * CLEARANCE)
          .addScaledVector(up, Math.sin((i * Math.PI) / 4) * CLEARANCE);
      const ray = this.ray;
      ray.origin.copy(origin);
      ray.direction.copy(direction);
      for (const id of candidates) {
        const at = id * STRIDE;
        this.a.fromArray(this.vertices, at);
        this.b.fromArray(this.vertices, at + 3);
        this.c.fromArray(this.vertices, at + 6);
        if (ray.intersectTriangle(this.a, this.b, this.c, false, this.point)) {
          const d = this.point.distanceTo(origin);
          if (d <= distance)
            closest = Math.min(closest, Math.max(0, d - CLEARANCE));
        }
      }
    }
    return closest / distance;
  };
}
