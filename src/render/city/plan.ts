import * as THREE from "three";
import { samples, roadWidth } from "../../track";

export const CITY_GROUND = -58;
export const CITY_GRID = 34;
const CITY_MARGIN = 560;
const CITY_ASSET_CLEARANCE = 3;
export interface CityPlot {
  id: number;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  kind: number;
  rotation: number;
  layer: "district" | "skyline";
  bounds: THREE.Box3;
}
export interface CityPlan {
  plots: CityPlot[];
  bounds: THREE.Box3;
  reservations: THREE.Box3[];
  parcels: { x: number; z: number; built: number; reserved: number }[];
}

/** Hash of a coordinate. Each parcel gets the same values every time, in any
 * build order, because there is no shared random-number state. */
function random(x: number, z: number, salt = 0) {
  let h =
    Math.imul(Math.round(x * 4), 374761393) ^
    Math.imul(Math.round(z * 4), 668265263) ^
    Math.imul(salt + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const roadBounds = new THREE.Box3().setFromPoints(samples.map((s) => s.p));

/** Reserve the space that the race architecture occupies.
 *
 * The road ribbons are divided into local groups. One box around the whole
 * course would reserve the complete district below the elevated roads. */
function cityReservations(architecture: THREE.Object3D) {
  const volumes: THREE.Box3[] = [];
  architecture.updateWorldMatrix(true, true);
  const vertex = new THREE.Vector3();
  architecture.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    if (object.userData.trackRibbon) {
      const position = geometry.attributes.position;
      // Each group holds complete triangles, the last group included.
      for (let i = 0; i < position.count; i += 96) {
        const b = new THREE.Box3();
        for (let j = i; j < Math.min(position.count, i + 96); j++)
          b.expandByPoint(
            vertex
              .fromBufferAttribute(position, j)
              .applyMatrix4(object.matrixWorld),
          );
        volumes.push(b.expandByScalar(CITY_ASSET_CLEARANCE));
      }
    } else {
      geometry.computeBoundingBox();
      volumes.push(
        geometry
          .boundingBox!.clone()
          .applyMatrix4(object.matrixWorld)
          .expandByScalar(CITY_ASSET_CLEARANCE),
      );
    }
  });
  // The chase view and the flight path of a jump also need space. Gaps are
  // included, so no building can fill a landing approach.
  samples.forEach((a, i) => {
    const b = samples[(i + 1) % samples.length];
    const corners = [a, b].flatMap((f) =>
      [-1, 1].flatMap((side) =>
        [-5, 18].map((y) =>
          f.p
            .clone()
            .addScaledVector(f.right, side * (roadWidth(f.t) / 2 + 8))
            .addScaledVector(f.up, y),
        ),
      ),
    );
    volumes.push(new THREE.Box3().setFromPoints(corners).expandByScalar(2));
  });
  return volumes;
}

/** Index of the reserved volumes by ground cell. A roof can be close to a
 * bridge in plan and still stay below it, so the height stays in the box. */
export class CityReservationIndex {
  private buckets = new Map<string, THREE.Box3[]>();
  constructor(volumes: THREE.Box3[]) {
    for (const b of volumes)
      this.cells(b, (key) => {
        const bucket = this.buckets.get(key) ?? [];
        bucket.push(b);
        this.buckets.set(key, bucket);
      });
  }
  private cells(b: THREE.Box3, visit: (key: string) => void) {
    for (let x = Math.floor(b.min.x / 64); x <= Math.floor(b.max.x / 64); x++)
      for (let z = Math.floor(b.min.z / 64); z <= Math.floor(b.max.z / 64); z++)
        visit(`${x},${z}`);
  }
  query(b: THREE.Box3) {
    const found = new Set<THREE.Box3>();
    this.cells(b, (key) =>
      this.buckets.get(key)?.forEach((v) => {
        if (
          v.max.x >= b.min.x &&
          v.min.x <= b.max.x &&
          v.max.z >= b.min.z &&
          v.min.z <= b.max.z
        )
          found.add(v);
      }),
    );
    return [...found];
  }
}
export function planCity(architecture: THREE.Object3D): CityPlan {
  const reservations = cityReservations(architecture);
  const index = new CityReservationIndex(reservations);
  const bounds = roadBounds.clone();
  bounds.min.x =
    Math.floor((bounds.min.x - CITY_MARGIN) / CITY_GRID) * CITY_GRID;
  bounds.min.z =
    Math.floor((bounds.min.z - CITY_MARGIN) / CITY_GRID) * CITY_GRID;
  bounds.max.x =
    Math.ceil((bounds.max.x + CITY_MARGIN) / CITY_GRID) * CITY_GRID;
  bounds.max.z =
    Math.ceil((bounds.max.z + CITY_MARGIN) / CITY_GRID) * CITY_GRID;
  bounds.min.y = CITY_GROUND;
  bounds.max.y = CITY_GROUND;
  const plots: CityPlot[] = [],
    parcels: CityPlan["parcels"] = [];
  function parcel(
    x: number,
    z: number,
    w: number,
    d: number,
    layer: CityPlot["layer"],
    depth = 0,
  ) {
    const footprint = new THREE.Box3(
      new THREE.Vector3(x - w / 2, CITY_GROUND, z - d / 2),
      new THREE.Vector3(x + w / 2, 400, z + d / 2),
    );
    const nearby = index.query(footprint);
    let ceiling = 400;
    for (const b of nearby)
      if (b.max.y > CITY_GROUND) ceiling = Math.min(ceiling, b.min.y - 0.5);
    if (ceiling - CITY_GROUND < 9) {
      // Put small workshops around a column instead of an empty block.
      if (depth < 2) {
        let built = 0,
          reserved = 0;
        for (const a of [-1, 1])
          for (const b of [-1, 1]) {
            const result = parcel(
              x + (a * w) / 4,
              z + (b * d) / 4,
              w / 2 - 1.5,
              d / 2 - 1.5,
              layer,
              depth + 1,
            );
            built += result.built;
            reserved += result.reserved;
          }
        return { built, reserved };
      }
      return { built: 0, reserved: 1 };
    }
    const local = nearby.length > 0;
    const r = random(x, z, 2);
    // Low factories stand below the road and beside it. The outer skyline is
    // varied but continuous. Tall blocks stay distant, so they never make a
    // wall in front of the driver.
    const height = Math.min(
      ceiling - CITY_GROUND,
      layer === "skyline"
        ? 120 + r * 170
        : local
          ? 18 + r * 34
          : 24 + r * r * 110,
    );
    const plot: CityPlot = {
      id: plots.length,
      x,
      z,
      width: w,
      depth: d,
      height,
      kind: Math.floor(random(x, z, 3) * 6),
      rotation: random(x, z, 4) > 0.5 ? Math.PI : 0,
      layer,
      bounds: footprint.clone(),
    };
    plot.bounds.max.y = CITY_GROUND + height;
    plots.push(plot);
    return { built: 1, reserved: 0 };
  }
  // Every district cell is built. Narrow alleys and regular service streets
  // give the scale. No block is missing and there is no empty ring.
  for (let x = bounds.min.x + CITY_GRID / 2; x < bounds.max.x; x += CITY_GRID)
    for (
      let z = bounds.min.z + CITY_GRID / 2;
      z < bounds.max.z;
      z += CITY_GRID
    ) {
      const streetX = Math.round(x / CITY_GRID) % 7 === 0 ? 7 : 3;
      const streetZ = Math.round(z / CITY_GRID) % 7 === 0 ? 7 : 3;
      const result = parcel(
        x,
        z,
        CITY_GRID - streetX,
        CITY_GRID - streetZ,
        "district",
      );
      parcels.push({ x, z, ...result });
    }
  // Four shallow rows give parallax, overlap and a full horizon in every
  // direction, at a small part of the cost of an unlimited city.
  const SKYLINE_LONG = 42,
    SKYLINE_SHORT = 24;
  for (let row = 0; row < 4; row++) {
    const inset = 32 + row * 48,
      stride = 46;
    const x0 = bounds.min.x - inset,
      x1 = bounds.max.x + inset;
    const z0 = bounds.min.z - inset,
      z1 = bounds.max.z + inset;
    for (let x = x0; x <= x1; x += stride)
      for (const z of [z0, z1])
        parcel(x, z, SKYLINE_LONG, SKYLINE_SHORT, "skyline");
    // A side row stops before it reaches the corner plot of an end row. The
    // two are turned ninety degrees to each other, so their half depths have
    // to clear, whatever the road bounds happen to be.
    const corner = (SKYLINE_LONG + SKYLINE_SHORT) / 2 + 1;
    for (let z = z0 + stride; z < z1 - corner; z += stride)
      for (const x of [x0, x1])
        parcel(x, z, SKYLINE_SHORT, SKYLINE_LONG, "skyline");
  }
  return { plots, bounds, reservations, parcels };
}
