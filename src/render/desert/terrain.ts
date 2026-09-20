import * as THREE from "three";
import { frame, length, roadWidth, samples, track } from "../../track";
import { inkLine } from "../geometry";
import { paint } from "../environment/surfaces";

/** The desert floor.
 *
 * The ground is not modelled and then fitted with a road. It is derived from
 * the road: a regional height field is spread out from the course itself, so
 * the high country stands where the circuit climbs and the pan lies where it
 * runs flat. Two authored figures are then cut into it — the dry lake and the
 * canyon — and a corridor is graded along the course so the deck always sits
 * on its own bench.
 *
 * The bench follows the banked section of the deck rather than its
 * centreline, because a corridor of 48 m at a bank of 0.3 rad drops nearly
 * 8 m from one edge to the other. A level bench under a banked road puts the
 * ground through the low edge of it.
 *
 * Every face is read twice: once as a triangle and once as a contour line.
 * The contours are indigo, they are drawn on the surface they measure, and
 * they are what turns a field of flat oxide facets into hills, benches and
 * cliffs that a driver can read at three hundred.
 *
 * Nothing here is random in a way the lap can feel. The undulation is a hash
 * of the coordinate, so the same place has the same height in every build,
 * and no part of the ground is a driving surface.
 */

/** Vertical room kept between the graded bench and the deck above it. */
const BENCH = 1.7;
/** Distance from the edge of the corridor over which the bench blends into
 * the natural ground, in metres. */
const BENCH_BLEND = 100;
/** Cell size of the near and far ground meshes, in metres. */
const NEAR_CELL = 20;
const FAR_CELL = 80;
/** Half-extent of the whole ground, measured from the middle of the course. */
const REACH = 2500;
/** Distance the near mesh keeps outside the plan of the course, in metres. */
const MARGIN = 560;
/** Vertical interval between contour lines, in metres. */
const CONTOUR = 16;
/** Strand lines on the dry lake, as fractions of its nominal edge. The pan
 * is level, so it carries no contour at all; these are the rings a lake
 * leaves behind as it dries, and they are the only thing that gives the
 * opening sector a scale. */
const STRANDS = [0.94, 0.78, 0.6, 0.4, 0.22];
/** Slope at which ground stops being a hillside and becomes a bluff. Gentle
 * country carries contours; a bluff carries one line along its edge instead,
 * because contours on a face that steep only stack up into a texture. */
const BREAK = 0.7;
/** Distance a drawn line stands off the face it is drawn on, in metres. */
const LIFT = 0.5;
/** The circuit sits in a basin. Inside `BASIN` metres of the course the
 * ground stays low and open, so no sightline is lost; beyond it, over
 * `BASIN_BLEND` more metres, the high country is allowed to rise. */
const BASIN = 70;
const BASIN_BLEND = 260;
/** Height of one bench in the terraced country, in metres. The step varies
 * over the map, so no two bluffs stand at the same set of levels. */
const STEP = 26;

const smooth = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
/** Hash of a coordinate. The same place gives the same value in every build,
 * in any order, because there is no shared random-number state. */
function hash(x: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smoothly interpolated value noise of one wavelength. */
function undulation(x: number, z: number, wavelength: number) {
  const u = x / wavelength,
    v = z / wavelength;
  const i = Math.floor(u),
    j = Math.floor(v);
  const fx = smooth(u - i),
    fz = smooth(v - j);
  const a = hash(i, j),
    b = hash(i + 1, j),
    c = hash(i, j + 1),
    d = hash(i + 1, j + 1);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}
/** Collect a height onto benches with steep risers between them. It is what
 * turns a smooth swell into a bluff, and it is what gives the contour lines
 * something to bunch against. */
function terrace(y: number, step: number, strength: number) {
  if (strength <= 0) return y;
  const u = y / step;
  const level = Math.floor(u);
  const part = u - level;
  return step * (level + part + strength * (smooth(part) - part));
}

/** Where the course is, in plan, at the resolution the ground needs.
 *
 * Gap samples are left out: the canyon has to cut straight through the place
 * the road is not. */
class CourseField {
  private readonly cells = new Map<number, number[]>();
  private readonly x: number[] = [];
  private readonly z: number[] = [];
  private readonly y: number[] = [];
  private readonly rx: number[] = [];
  private readonly ry: number[] = [];
  private readonly rz: number[] = [];
  private readonly half: number[] = [];
  readonly bounds = new THREE.Box2();
  private static readonly CELL = 64;
  constructor() {
    for (const sample of samples) {
      if (sample.gap) continue;
      const index = this.x.length;
      this.x.push(sample.p.x);
      this.z.push(sample.p.z);
      this.y.push(sample.p.y);
      this.rx.push(sample.right.x);
      this.ry.push(sample.right.y);
      this.rz.push(sample.right.z);
      this.half.push(roadWidth(sample.t) / 2);
      this.bounds.expandByPoint(new THREE.Vector2(sample.p.x, sample.p.z));
      const key = this.key(sample.p.x, sample.p.z);
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(index);
      else this.cells.set(key, [index]);
    }
  }
  private key(x: number, z: number) {
    const cx = Math.floor(x / CourseField.CELL) + 4096;
    const cz = Math.floor(z / CourseField.CELL) + 4096;
    return cx * 8192 + cz;
  }
  /** Nearest course station in plan, out to `reach` metres, with the height
   * of the deck above the point rather than the height of its centreline.
   * Beyond `reach` the ground is on its own and the search stops. */
  near(x: number, z: number, reach: number) {
    const rings = Math.ceil(reach / CourseField.CELL);
    const cx = Math.floor(x / CourseField.CELL);
    const cz = Math.floor(z / CourseField.CELL);
    let best = -1,
      distance = Infinity;
    for (let ring = 0; ring <= rings; ring++) {
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
          const bucket = this.cells.get(
            this.key((cx + i) * CourseField.CELL, (cz + j) * CourseField.CELL),
          );
          if (!bucket) continue;
          for (const index of bucket) {
            const d = (this.x[index] - x) ** 2 + (this.z[index] - z) ** 2;
            if (d < distance) {
              distance = d;
              best = index;
            }
          }
        }
      // Cells beyond this ring cannot hold anything closer than the ring
      // itself, so the search stops as soon as the hit is inside it.
      if (best >= 0 && distance <= (ring * CourseField.CELL) ** 2) break;
    }
    if (best < 0) return null;
    // The lateral offset of the point, read back through the plan part of the
    // right vector, gives the height of the banked deck over it.
    const plan = this.rx[best] ** 2 + this.rz[best] ** 2;
    const lateral =
      plan > 1e-6
        ? ((x - this.x[best]) * this.rx[best] +
            (z - this.z[best]) * this.rz[best]) /
          plan
        : 0;
    const half = this.half[best];
    const held = Math.max(-half, Math.min(half, lateral));
    return {
      distance: Math.sqrt(distance),
      deck: this.y[best] + this.ry[best] * held,
      half,
    };
  }
  /** Height of the country around a point, spread out from the course by
   * inverse distance. It is defined everywhere and settles to the lowest
   * ground the circuit reaches once far enough away. */
  regional(x: number, z: number) {
    let weight = 0,
      sum = 0;
    for (let i = 0; i < this.x.length; i += 6) {
      const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2 + 40000;
      const w = 1 / (d * d);
      weight += w;
      sum += this.y[i] * w;
    }
    return sum / weight;
  }
}

/** The dry lake: a level pan with a hard edge, lying under the opening
 * sector. Its middle is the lowest ground on the circuit. */
function lakePan() {
  const f = frame(0);
  const centre = new THREE.Vector2(f.p.x, f.p.z).add(
    new THREE.Vector2(f.forward.x, f.forward.z).normalize().multiplyScalar(620),
  );
  return { centre, radius: new THREE.Vector2(980, 620), y: f.p.y - 7 };
}

/** The canyon.
 *
 * It is a slot where the road crosses it and a wide chasm away from it, which
 * is the reason the circuit jumps here and nowhere else: the crossing is at
 * the one place narrow enough to clear. The mouth holds the width of the gap
 * over the whole corridor, so the embankment runs out to the lip and the
 * ground then falls away. */
function canyonCut() {
  const gap = track.gaps[0];
  if (!gap) return null;
  const middle = (gap[0] + gap[1]) / 2;
  const f = frame(middle);
  const centre = new THREE.Vector2(f.p.x, f.p.z);
  const along = new THREE.Vector2(f.right.x, f.right.z).normalize();
  const across = new THREE.Vector2(f.forward.x, f.forward.z).normalize();
  const floor = f.p.y - 148;
  // The trench widens away from the crossing, and closes before it reaches
  // the far side of the lap. The circuit runs round the head of it.
  const flare = (out: number) => smooth((out - 30) / 300);
  /** Depth of the trench at a point, from 0 on the rim to 1 on the floor. */
  const depth = (x: number, z: number) => {
    const dx = x - centre.x,
      dz = z - centre.y;
    const out = Math.abs(dx * along.x + dz * along.y);
    const over = Math.abs(dx * across.x + dz * across.y);
    const mouth = 19 + 70 * flare(out);
    const wall = 14 + 60 * flare(out);
    return (
      (1 - smooth((out - 300) / 160)) * (1 - smooth((over - mouth) / wall))
    );
  };
  return {
    centre,
    along,
    across,
    floor,
    depth,
    carve: (x: number, z: number, y: number) => {
      const cut = depth(x, z);
      return y * (1 - cut) + floor * cut;
    },
  };
}

/** One rectangular field of ground heights. The mesh and its contour lines
 * are both read from it, so a drawn line always lies on the face it
 * describes. */
type Sheet = {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  y: Float64Array;
  /** Slope at the point, as rise over run. */
  grade: Float64Array;
  /** 1 where the point is on the graded bench beside the road, which carries
   * no contour because the deck covers it. */
  graded: Uint8Array;
};

export type DesertGround = ReturnType<typeof buildGround>;

export function buildGround() {
  const field = new CourseField();
  const lake = lakePan();
  const canyon = canyonCut();
  const middle = new THREE.Vector2();
  field.bounds.getCenter(middle);
  // The regional field and the distance to the course are both slow to
  // evaluate, so they are taken once on a coarse grid and read back by
  // interpolation.
  const COARSE = 160;
  const span = Math.ceil((REACH * 2) / COARSE) + 1;
  const origin = { x: middle.x - REACH, z: middle.y - REACH };
  const coarse = new Float32Array(span * span);
  const spread = new Float32Array(span * span);
  const far = BASIN + BASIN_BLEND;
  for (let i = 0; i < span; i++)
    for (let j = 0; j < span; j++) {
      const x = origin.x + i * COARSE,
        z = origin.z + j * COARSE;
      coarse[i * span + j] = field.regional(x, z);
      spread[i * span + j] = field.near(x, z, far)?.distance ?? far;
    }
  const read = (grid: Float32Array, x: number, z: number) => {
    const u = Math.max(0, Math.min(span - 1.001, (x - origin.x) / COARSE));
    const v = Math.max(0, Math.min(span - 1.001, (z - origin.z) / COARSE));
    const i = Math.floor(u),
      j = Math.floor(v);
    const fx = u - i,
      fz = v - j;
    const a = grid[i * span + j],
      b = grid[(i + 1) * span + j];
    const c = grid[i * span + j + 1],
      d = grid[(i + 1) * span + j + 1];
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  };
  const regional = (x: number, z: number) => read(coarse, x, z);
  /** How much relief this place is allowed: none in the basin the circuit
   * sits in, all of it out on the rim. */
  const rise = (x: number, z: number) =>
    smooth((read(spread, x, z) - BASIN) / BASIN_BLEND);

  /** Distance from the middle of the dry lake, as a fraction of its nominal
   * edge. The pan runs out between 0.82 and 1.06. */
  const lakeRadius = (x: number, z: number) =>
    Math.hypot(
      (x - lake.centre.x) / lake.radius.x,
      (z - lake.centre.y) / lake.radius.y,
    );
  /** True where the dry lake floor replaces the natural ground. */
  function onLake(x: number, z: number) {
    return 1 - smooth((lakeRadius(x, z) - 0.82) / 0.24);
  }
  function natural(x: number, z: number) {
    const open = rise(x, z);
    // Five octaves. Each one keeps a little of itself inside the basin, so
    // the ground beside the road is never dead flat, and opens up out on the
    // rim where relief costs no sightline.
    const swell =
      regional(x, z) -
      16 +
      (12 + 74 * open) * (undulation(x, z, 1150) - 0.5) +
      (10 + 44 * open) * (undulation(x, z, 430) - 0.5) +
      (6 + 22 * open) * (undulation(x, z, 210) - 0.5) +
      (4 + 10 * open) * (undulation(x, z, 95) - 0.5) +
      3.5 * (undulation(x, z, 62) - 0.5);
    const step = STEP * (0.7 + 0.7 * undulation(x, z, 2300));
    const base = terrace(swell, step, 0.6 * open);
    const pan = onLake(x, z);
    const y = base * (1 - pan) + lake.y * pan;
    return canyon ? canyon.carve(x, z, y) : y;
  }
  /** Ground at a point: the graded bench that carries the deck near the
   * course, the natural desert away from it, and the canyon wherever the
   * trench is open, because the road jumps that and does not sit on it. */
  function ground(x: number, z: number) {
    const wild = natural(x, z);
    const near = field.near(x, z, BENCH_BLEND + 90);
    const trench = canyon ? canyon.depth(x, z) : 0;
    if (!near) return { y: wild, graded: false };
    const edge = near.distance - near.half - 5;
    const bench = near.deck - BENCH;
    const away = Math.max(smooth(edge / BENCH_BLEND), trench);
    const blended = bench + (wild - bench) * away;
    // Inside the corridor the bench is absolute: no undulation may ever come
    // up through the deck.
    return {
      y: edge <= 0 ? Math.min(blended, bench) : blended,
      graded: edge <= 6 && trench < 0.05,
    };
  }
  const height = (x: number, z: number) => ground(x, z).y;

  const sheet = (
    x0: number,
    z0: number,
    cell: number,
    nx: number,
    nz: number,
  ): Sheet => {
    const y = new Float64Array((nx + 1) * (nz + 1));
    const grade = new Float64Array((nx + 1) * (nz + 1));
    const graded = new Uint8Array((nx + 1) * (nz + 1));
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j <= nz; j++) {
        const g = ground(x0 + i * cell, z0 + j * cell);
        y[i * (nz + 1) + j] = g.y;
        graded[i * (nz + 1) + j] = g.graded ? 1 : 0;
      }
    // The slope comes from the sheet itself, so the line that marks a bluff
    // and the face that draws it describe the same ground.
    const at = (i: number, j: number) =>
      y[Math.max(0, Math.min(nx, i)) * (nz + 1) + Math.max(0, Math.min(nz, j))];
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j <= nz; j++)
        grade[i * (nz + 1) + j] = Math.hypot(
          (at(i + 1, j) - at(i - 1, j)) / (2 * cell),
          (at(i, j + 1) - at(i, j - 1)) / (2 * cell),
        );
    return { x0, z0, cell, nx, nz, y, grade, graded };
  };

  // The near mesh covers a whole number of far cells, so the two resolutions
  // share their boundary exactly.
  const ratio = FAR_CELL / NEAR_CELL;
  const cells = Math.ceil((REACH * 2) / FAR_CELL);
  const lowI = Math.max(
    0,
    Math.floor((field.bounds.min.x - MARGIN - origin.x) / FAR_CELL),
  );
  const highI = Math.min(
    cells,
    Math.ceil((field.bounds.max.x + MARGIN - origin.x) / FAR_CELL),
  );
  const lowJ = Math.max(
    0,
    Math.floor((field.bounds.min.y - MARGIN - origin.z) / FAR_CELL),
  );
  const highJ = Math.min(
    cells,
    Math.ceil((field.bounds.max.y + MARGIN - origin.z) / FAR_CELL),
  );
  const near = sheet(
    origin.x + lowI * FAR_CELL,
    origin.z + lowJ * FAR_CELL,
    NEAR_CELL,
    (highI - lowI) * ratio,
    (highJ - lowJ) * ratio,
  );

  const desert: number[] = [],
    pan: number[] = [],
    drawn: number[] = [];
  const arm = new THREE.Vector3(),
    leg = new THREE.Vector3(),
    normal = new THREE.Vector3();
  /** The segment where one field crosses one level inside a triangle, stood
   * off the face so that it is drawn and not fought over. */
  const crossing = (p: THREE.Vector3[], v: number[], level: number) => {
    const ends: THREE.Vector3[] = [];
    for (let e = 0; e < 3; e++) {
      const i = e,
        j = (e + 1) % 3;
      if (v[i] < level === v[j] < level) continue;
      ends.push(p[i].clone().lerp(p[j], (level - v[i]) / (v[j] - v[i])));
    }
    if (ends.length !== 2) return;
    arm.subVectors(p[1], p[0]);
    leg.subVectors(p[2], p[0]);
    normal.crossVectors(arm, leg).normalize();
    if (normal.y < 0) normal.negate();
    for (const q of ends)
      drawn.push(
        q.x + normal.x * LIFT,
        q.y + normal.y * LIFT,
        q.z + normal.z * LIFT,
      );
  };
  const point = (s: Sheet, i: number, j: number) =>
    new THREE.Vector3(
      s.x0 + i * s.cell,
      s.y[i * (s.nz + 1) + j],
      s.z0 + j * s.cell,
    );

  /** Lay one sheet down as faces, and read its contours off the same
   * triangles. `shore` also draws the edge of the pan, which is a change of
   * ground and not a change of height. */
  const lay = (
    s: Sheet,
    options: { skip?: (i: number, j: number) => boolean; shore?: boolean } = {},
  ) => {
    for (let i = 0; i < s.nx; i++)
      for (let j = 0; j < s.nz; j++) {
        if (options.skip?.(i, j)) continue;
        const x = s.x0 + (i + 0.5) * s.cell,
          z = s.z0 + (j + 0.5) * s.cell;
        const corners = [
          [i, j],
          [i, j + 1],
          [i + 1, j],
          [i + 1, j + 1],
        ].map(([a, b]) => point(s, a, b));
        const index = [
          [i, j],
          [i, j + 1],
          [i + 1, j],
          [i + 1, j + 1],
        ].map(([a, b]) => a * (s.nz + 1) + b);
        const flat = index.map((k) => s.graded[k]);
        const steep = index.map((k) => s.grade[k]);
        const wet = options.shore
          ? corners.map((p) => lakeRadius(p.x, p.z))
          : null;
        const into = onLake(x, z) > 0.5 ? pan : desert;
        for (const k of [0, 1, 2, 2, 1, 3])
          into.push(corners[k].x, corners[k].y, corners[k].z);
        for (const triangle of [
          [0, 1, 2],
          [2, 1, 3],
        ]) {
          const p = triangle.map((k) => corners[k]);
          if (wet) {
            const ring = triangle.map((k) => wet[k]);
            for (const level of STRANDS) crossing(p, ring, level);
          }
          if (triangle.every((k) => flat[k])) continue;
          const slope = triangle.map((k) => steep[k]);
          crossing(p, slope, BREAK);
          if (Math.max(...slope) >= BREAK) continue;
          const y = p.map((q) => q.y);
          const first = Math.ceil(Math.min(...y) / CONTOUR);
          const last = Math.floor(Math.max(...y) / CONTOUR);
          for (let level = first; level <= last; level++)
            crossing(p, y, level * CONTOUR);
        }
      }
  };
  lay(near, { shore: true });
  lay(sheet(origin.x, origin.z, FAR_CELL, cells, cells), {
    skip: (i, j) => i >= lowI && i < highI && j >= lowJ && j < highJ,
  });

  const root = new THREE.Group();
  root.name = "desert-ground";
  // The pan is a single flat plane of oxide with no shading at all, so the
  // dry lake reads as smooth ground beside the faceted desert around it.
  for (const [positions, material] of [
    [desert, paint.ground],
    [pan, paint.red],
  ] as const) {
    if (!positions.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeVertexNormals();
    root.add(new THREE.Mesh(geometry, material));
  }
  if (drawn.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(drawn, 3),
    );
    root.add(new THREE.LineSegments(geometry, inkLine("blue")));
  }
  const bounds = new THREE.Box2(
    new THREE.Vector2(near.x0, near.z0),
    new THREE.Vector2(
      near.x0 + near.nx * NEAR_CELL,
      near.z0 + near.nz * NEAR_CELL,
    ),
  );
  return { root, height, natural, lake, canyon, bounds, length };
}
