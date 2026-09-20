import * as THREE from "three";
import { box } from "../geometry";
import { paint } from "../environment/surfaces";

/** The standing parts of the proving ground.
 *
 * Every piece is a silhouette first: a dish, a mast, a pylon, a wall. They
 * are built large and simple, because at this scale a driver reads their
 * outline against the sky and never their detail. Solar yellow appears only
 * where a shape is a racing reference. */

type Point = [number, number, number];

const part = (
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material = paint.steel,
  outline: "red" | "green" | "blue" | undefined = "red",
) => {
  const mesh = box(w, h, d, material, outline);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
};
const beam = (
  group: THREE.Group,
  a: Point,
  b: Point,
  width: number,
  material: THREE.Material = paint.steel,
) => {
  const from = new THREE.Vector3(...a),
    to = new THREE.Vector3(...b);
  const mesh = box(width, from.distanceTo(to), width, material, "red");
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    to.sub(from).normalize(),
  );
  group.add(mesh);
  return mesh;
};

/** A tapered lattice tower: four legs and alternating bracing. */
function lattice(
  group: THREE.Group,
  height: number,
  base: number,
  top: number,
  bays = 6,
) {
  const corner = (level: number, sx: number, sz: number) => {
    const half = (base + (top - base) * level) / 2;
    return [sx * half, level * height, sz * half] as Point;
  };
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const)
    beam(group, corner(0, sx, sz), corner(1, sx, sz), Math.max(0.5, base / 14));
  for (let i = 0; i < bays; i++) {
    const a = i / bays,
      b = (i + 1) / bays;
    for (const [sx, sz, tx, tz] of [
      [-1, -1, 1, -1],
      [1, -1, 1, 1],
      [1, 1, -1, 1],
      [-1, 1, -1, -1],
    ] as const) {
      beam(group, corner(a, sx, sz), corner(b, tx, tz), 0.34);
      beam(group, corner(b, sx, sz), corner(b, tx, tz), 0.34);
    }
  }
}

/** A steerable dish on a yoke, on a lattice pedestal. The rim carries the
 * only yellow on the piece, so the dish reads from a long way out. */
export function radarDish(radius: number, tilt = 0.62) {
  const group = new THREE.Group();
  group.name = "radar-dish";
  const pedestal = radius * 0.95;
  lattice(group, pedestal, radius * 0.66, radius * 0.34, 5);
  part(group, radius * 0.6, radius * 0.18, radius * 0.6, 0, pedestal, 0);
  // The head holds the dish axis. Tilt is measured from the horizon, so a
  // small angle points the mouth out across the desert.
  const head = new THREE.Group();
  head.position.y = pedestal + radius * 0.42;
  head.rotation.x = -(Math.PI / 2 - tilt);
  group.add(head);
  // A real paraboloid, lathed from its own profile: the mouth is a circle of
  // the stated radius and the feed sits at the focus.
  const focal = radius * 0.78;
  const depth = (radius * radius) / (4 * focal);
  const face = new THREE.Mesh(
    new THREE.LatheGeometry(
      Array.from({ length: 10 }, (_, i) => {
        const r = (radius * i) / 9;
        return new THREE.Vector2(r, (r * r) / (4 * focal));
      }),
      24,
    ),
    paint.concrete,
  );
  face.userData.outline = "red";
  head.add(face);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius, radius * 0.03, 4, 32),
    paint.green,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = depth;
  head.add(rim);
  // A quadripod carries the feed can at the focus of the dish.
  for (const [sx, sz] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const)
    beam(
      head,
      [sx * radius * 0.88, depth * 0.86, sz * radius * 0.88],
      [0, focal, 0],
      radius * 0.03,
    );
  part(
    head,
    radius * 0.18,
    radius * 0.26,
    radius * 0.18,
    0,
    focal,
    0,
    paint.blue,
  );
  // Backing ribs and the counterweight behind the mouth.
  for (const side of [-1, 1]) {
    beam(
      head,
      [side * radius * 0.85, depth * 0.9, 0],
      [0, -radius * 0.34, 0],
      radius * 0.05,
    );
    beam(
      head,
      [0, depth * 0.2, side * radius * 0.85],
      [0, -radius * 0.34, 0],
      radius * 0.05,
    );
  }
  part(head, radius * 0.5, radius * 0.22, radius * 0.5, 0, -radius * 0.4, 0);
  return group;
}

/** A portal frame over the road: the head of a buried facility, with the
 * clearance a car needs cut through it. */
export function portal(span: number, clear: number, height: number) {
  const group = new THREE.Group();
  group.name = "portal";
  const leg = (span - clear) / 2;
  for (const side of [-1, 1])
    part(
      group,
      leg,
      height,
      6,
      (side * (clear + leg)) / 2,
      height / 2,
      0,
      paint.concrete,
    );
  part(group, span, height * 0.3, 6.8, 0, height * 1.15, 0, paint.concrete);
  part(group, clear, 0.5, 7.2, 0, height * 1.0, 0, paint.green, undefined);
  return group;
}

/** A microwave relay: a tapered mast with horn drums and a lit tip. */
export function microwaveTower(height: number) {
  const group = new THREE.Group();
  group.name = "microwave-tower";
  lattice(group, height, height * 0.16, height * 0.06, 9);
  for (const level of [0.52, 0.68, 0.84]) {
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(
        height * 0.05,
        height * 0.05,
        height * 0.07,
        8,
      ),
      paint.blue,
    );
    drum.userData.outline = "red";
    drum.rotation.z = Math.PI / 2;
    drum.position.set(height * 0.07, height * level, 0);
    group.add(drum);
  }
  part(group, height * 0.02, height * 0.1, height * 0.02, 0, height * 1.05, 0);
  part(
    group,
    height * 0.035,
    height * 0.035,
    height * 0.035,
    0,
    height * 1.11,
    0,
    paint.green,
    undefined,
  );
  return group;
}

/** A transmission pylon. A line of them is a straight edge drawn across the
 * desert, which is what the lakebed is aimed along. */
export function pylon(height: number) {
  const group = new THREE.Group();
  group.name = "pylon";
  const waist = height * 0.28;
  for (const side of [-1, 1]) {
    beam(
      group,
      [side * height * 0.19, 0, 0],
      [side * height * 0.05, waist, 0],
      height * 0.022,
    );
    beam(
      group,
      [side * height * 0.05, waist, 0],
      [side * height * 0.035, height, 0],
      height * 0.018,
    );
  }
  for (let i = 0; i < 5; i++) {
    const a = waist * (i / 5),
      b = waist * ((i + 1) / 5);
    beam(
      group,
      [-height * 0.19 + (height * 0.14 * i) / 5, a, 0],
      [height * 0.19 - (height * 0.14 * (i + 1)) / 5, b, 0],
      height * 0.012,
    );
  }
  for (const [level, reach] of [
    [0.62, 0.3],
    [0.8, 0.24],
    [0.96, 0.17],
  ] as const) {
    part(
      group,
      height * reach * 2,
      height * 0.016,
      height * 0.03,
      0,
      height * level,
      0,
    );
    for (const side of [-1, 1])
      beam(
        group,
        [side * height * reach, height * level, 0],
        [side * height * 0.045, height * (level - 0.09), 0],
        height * 0.011,
      );
  }
  return group;
}

/** A half-buried instrumentation bunker: a thick slab, a blast door slot and
 * an earth ramp down to it. */
export function bunker(width: number, depth: number, height: number) {
  const group = new THREE.Group();
  group.name = "bunker";
  part(group, width, height, depth, 0, height / 2, 0, paint.concrete);
  part(
    group,
    width * 1.16,
    height * 0.22,
    depth * 1.16,
    0,
    height * 0.99,
    0,
    paint.concrete,
  );
  part(
    group,
    width * 0.34,
    height * 0.62,
    depth * 0.1,
    0,
    height * 0.31,
    depth * 0.53,
    paint.blue,
  );
  for (const side of [-1, 1])
    part(
      group,
      width * 0.1,
      height * 0.8,
      depth * 0.9,
      (side * width) / 2,
      height * 0.4,
      0,
      paint.concrete,
    );
  return group;
}

/** A blast wall: a long slab on splayed buttresses. */
export function blastWall(span: number, height: number) {
  const group = new THREE.Group();
  group.name = "blast-wall";
  part(group, span, height, 1.4, 0, height / 2, 0, paint.concrete);
  const bays = Math.max(2, Math.round(span / 12));
  for (let i = 0; i <= bays; i++) {
    const x = -span / 2 + (span * i) / bays;
    part(group, 1.2, height * 0.9, 4.2, x, height * 0.45, -2.1, paint.concrete);
  }
  part(group, span, height * 0.09, 2.2, 0, height, 0, paint.green, undefined);
  return group;
}

/** A phased array field: rows of thin masts, all the same, reading as one
 * rectangle of texture on the desert floor. */
export function antennaArray(rows: number, columns: number, spacing: number) {
  const group = new THREE.Group();
  group.name = "antenna-array";
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < columns; j++) {
      const x = (i - (rows - 1) / 2) * spacing;
      const z = (j - (columns - 1) / 2) * spacing;
      part(group, 0.5, 15, 0.5, x, 7.5, z);
      part(group, 2.6, 0.4, 2.6, x, 15.2, z, paint.blue);
    }
  return group;
}

/** A mesa: a flat top, steep sides and a talus skirt. The footprint is a
 * regular polygon deformed by its own coordinates, so it is irregular in
 * plan and identical in every build. */
export function mesa(radius: number, height: number, sides = 9, seed = 1) {
  const group = new THREE.Group();
  group.name = "mesa";
  const wobble = (i: number) => {
    let h = Math.imul(i + seed * 31, 374761393);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return 0.72 + 0.46 * (((h ^ (h >>> 16)) >>> 0) / 4294967296);
  };
  const ring = (scale: number, y: number) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      const r = radius * scale * wobble(i);
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    });
  const skirt = ring(1.34, -height * 0.05);
  const shoulder = ring(1.0, height * 0.72);
  const cap = ring(0.9, height);
  const positions: number[] = [];
  const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    for (const p of [a, b, c]) positions.push(p.x, p.y, p.z);
  };
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    face(skirt[i], shoulder[i], skirt[j]);
    face(skirt[j], shoulder[i], shoulder[j]);
    face(shoulder[i], cap[i], shoulder[j]);
    face(shoulder[j], cap[i], cap[j]);
    face(cap[0], cap[i], cap[j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  // A mesa is landform, not structure, so its edges are drawn in the same
  // indigo as the contours of the ground it stands on.
  const mesh = new THREE.Mesh(geometry, paint.concrete);
  mesh.userData.outline = "blue";
  group.add(mesh);
  return group;
}

/** A service road running away from the circuit: a flat strip that gives the
 * open ground a direction and a horizon to disappear into. */
export function serviceRoad(
  from: THREE.Vector3,
  to: THREE.Vector3,
  width: number,
  height: (x: number, z: number) => number,
) {
  const group = new THREE.Group();
  group.name = "service-road";
  const steps = Math.max(2, Math.round(from.distanceTo(to) / 55));
  const direction = to.clone().sub(from);
  const side = new THREE.Vector3(-direction.z, 0, direction.x)
    .normalize()
    .multiplyScalar(width / 2);
  const positions: number[] = [];
  let previous: THREE.Vector3[] | null = null;
  for (let i = 0; i <= steps; i++) {
    const centre = from.clone().addScaledVector(direction, i / steps);
    centre.y = height(centre.x, centre.z) + 0.35;
    const edges = [
      centre.clone().sub(side),
      centre.clone().add(side),
    ] as THREE.Vector3[];
    if (previous)
      for (const p of [
        previous[0],
        edges[0],
        previous[1],
        previous[1],
        edges[0],
        edges[1],
      ])
        positions.push(p.x, p.y, p.z);
    previous = edges;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry, paint.blue));
  return group;
}
