import * as THREE from "three";
import {
  deckSegments,
  frame,
  length,
  onCourseChange,
  roadWidth,
  track,
} from "../../track";
import { printed, solid } from "../ink";

/** Road frames and widths at the deck-segment boundaries. Every surface pass
 * walks the same stations, so they are computed once and shared. The frame
 * vectors are read-only for callers; each pass copies what it needs. */
let stations = new Map<
  number,
  { f: ReturnType<typeof frame>; width: number }
>();
onCourseChange(() => {
  stations = new Map();
});
const station = (t: number) => {
  let entry = stations.get(t);
  if (!entry) stations.set(t, (entry = { f: frame(t), width: roadWidth(t) }));
  return entry;
};

/** Shared ink materials for every static track surface. */
export const paint = {
  blue: solid("blue"),
  red: solid("red"),
  green: solid("green"),
  steel: printed("red"),
  concrete: printed("red", "concrete"),
  asphalt: printed("red", "road"),
  /** Open ground. Earth stays oxide, and only a real slope goes dark. */
  ground: printed("red", "desert"),
};

/** A lateral figure: either a constant, or one that follows the road. */
export type Across = number | ((t: number) => number);
const value = (across: Across, t: number) =>
  typeof across === "number" ? across : across(t);

/** A strip of deck. `offset` and `width` are in metres.
 *
 * A scaled strip keeps its share of the road as the corridor opens and
 * closes, which is what edge markings want. An unscaled strip keeps the
 * metres it was given, which is what a painted lane inside a wider corridor
 * wants; give it functions of the station to let it wander. */
export function ribbon(
  offset: Across,
  width: Across,
  height: number,
  material: THREE.Material,
  options: { skip?: (t: number) => boolean; scaled?: boolean } = {},
) {
  const scaled = options.scaled ?? true;
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [];
  for (const { a, b } of deckSegments) {
    if (options.skip?.(a)) continue;
    const ends = [station(a), station(b)];
    const f = [ends[0].f, ends[1].f];
    const across = [a, b].map((t, i) => {
      const scale = scaled ? ends[i].width / track.width : 1;
      const half = (value(width, t) / 2) * scale;
      const centre = value(offset, t) * scale;
      return { left: centre - half, right: centre + half };
    });
    const span = Math.max(
      across[0].right - across[0].left,
      across[1].right - across[1].left,
    );
    const divisions = Math.max(1, Math.ceil(span / 1.5));
    for (let part = 0; part < divisions; part++) {
      const edge = (end: 0 | 1, step: number) =>
        across[end].left +
        ((across[end].right - across[end].left) * step) / divisions;
      const lat = [
        edge(0, part),
        edge(0, part + 1),
        edge(1, part),
        edge(1, part + 1),
      ];
      for (const index of [0, 2, 1, 1, 2, 3]) {
        const end = index < 2 ? 0 : 1;
        const p = f[end].p
          .clone()
          .addScaledVector(f[end].right, lat[index])
          .addScaledVector(f[end].up, height);
        positions.push(...p.toArray());
        normals.push(...f[end].up.toArray());
        uvs.push(lat[index], (end ? b : a) * length);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.trackRibbon = true;
  return mesh;
}
export function fascia(
  side: number,
  bottom: number,
  top: number,
  material: THREE.Material,
  extra = 0,
  skip?: (t: number) => boolean,
) {
  const positions: number[] = [],
    uvs: number[] = [];
  for (const { a, b } of deckSegments) {
    if (skip?.(a)) continue;
    const ends = [station(a), station(b)];
    const f = [ends[0].f, ends[1].f];
    for (const index of [0, 2, 1, 1, 2, 3]) {
      const end = index < 2 ? 0 : 1;
      const elevation = index % 2 ? top : bottom;
      const p = f[end].p
        .clone()
        .addScaledVector(f[end].right, side * (ends[end].width / 2 + extra))
        .addScaledVector(f[end].up, elevation);
      positions.push(...p.toArray());
      uvs.push((end ? b : a) * length, elevation);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.trackRibbon = true;
  return mesh;
}
