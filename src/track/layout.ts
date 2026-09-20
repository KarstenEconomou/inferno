/** Plan-view drafting for a course.
 *
 * A circuit is drawn the way a road is surveyed. The designer marks the
 * corners of a closed polygon, and each mark is replaced by the corner that
 * belongs there: a ramp that winds curvature on, a constant-radius arc, and a
 * ramp that winds it off again. Curvature is therefore continuous along the
 * whole lap, so the compiled bank sweeps instead of stepping and no choice of
 * node spacing can put a ripple into the deck.
 *
 * The polygon closes because its marks are positions, so a draft is edited by
 * moving a corner on the map rather than by solving for its angle. The lap
 * begins where the last corner lets go of its curvature, which is the natural
 * place for a timing line: the start of the run into the first mark.
 */
const DEGREES = Math.PI / 180;
/** Samples per curvature ramp. The offsets are integrated once, at build. */
const RAMP_STEPS = 4096;

export interface DraftCorner {
  /** Identifies the corner to the course that authored it. */
  name: string;
  /** Plan position of the polygon vertex, in metres. */
  at: [number, number];
  /** Radius of the sustained arc, in metres. */
  radius: number;
  /** Length of the curvature ramp at each end of the arc, in metres. */
  ramp: number;
  /** Complete extra revolutions inside the arc. One of them is a helix. */
  revolutions?: number;
}

/** A point on the drawing. Y belongs to the elevation profile, not here. */
type Plan = { x: number; z: number };
/** Where one corner sits along the lap, in metres from the start. */
export interface CornerMark {
  name: string;
  /** Start of the entry ramp and end of the exit ramp. */
  enter: number;
  exit: number;
  /** The constant-radius part, which is the corner a driver feels. */
  arc: [number, number];
  apex: number;
  radius: number;
  turn: number;
  /** Length of the straight that runs into the corner. */
  straight: number;
}

/** Cumulative offsets of one curvature ramp in the frame it starts in.
 * `entry` winds curvature from zero up to 1/radius, `exit` unwinds it. */
function rampOffsets(radius: number, ramp: number) {
  const step = ramp / RAMP_STEPS;
  const total = ramp / (2 * radius);
  const build = (heading: (s: number) => number) => {
    const x = new Float64Array(RAMP_STEPS + 1);
    const z = new Float64Array(RAMP_STEPS + 1);
    for (let i = 1; i <= RAMP_STEPS; i++) {
      // Midpoint rule. The integrand is smooth, so this is exact enough that
      // the corner still lands on its own tangent point.
      const angle = heading((i - 0.5) * step);
      x[i] = x[i - 1] + Math.cos(angle) * step;
      z[i] = z[i - 1] + Math.sin(angle) * step;
    }
    return { x, z };
  };
  const wind = (s: number) => {
    const u = s / ramp;
    return (ramp / radius) * (u ** 3 - u ** 4 / 2);
  };
  return {
    turn: total,
    entry: build(wind),
    exit: build((s) => total - wind(ramp - s)),
  };
}
function offsetAt(table: { x: Float64Array; z: Float64Array }, u: number) {
  const position = Math.max(0, Math.min(RAMP_STEPS, u * RAMP_STEPS));
  const i = Math.min(RAMP_STEPS - 1, Math.floor(position));
  const f = position - i;
  return {
    x: table.x[i] + (table.x[i + 1] - table.x[i]) * f,
    z: table.z[i] + (table.z[i + 1] - table.z[i]) * f,
  };
}

/** Place `offset`, stated in a frame heading along `angle`, into the drawing. */
function place(origin: Plan, angle: number, offset: Plan): Plan {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  return {
    x: origin.x + offset.x * cos - offset.z * sin,
    z: origin.z + offset.x * sin + offset.z * cos,
  };
}

/** Compile a draft into an evenly spaced, curvature-continuous centreline. */
export function draftPlan(
  corners: DraftCorner[],
  options: { spacing: number },
) {
  const vertices: Plan[] = corners.map((c) => ({ x: c.at[0], z: c.at[1] }));
  const next = (i: number) => (i + 1) % corners.length;
  const runs = vertices.map((v, i) =>
    Math.hypot(vertices[next(i)].x - v.x, vertices[next(i)].z - v.z),
  );
  const directions = vertices.map((v, i) => ({
    x: (vertices[next(i)].x - v.x) / runs[i],
    z: (vertices[next(i)].z - v.z) / runs[i],
  }));
  const turns = directions.map((d, i) => {
    const previous = directions[(i + corners.length - 1) % corners.length];
    return Math.atan2(
      previous.x * d.z - previous.z * d.x,
      previous.x * d.x + previous.z * d.z,
    );
  });
  // Each corner is fitted into its vertex: the tangent length says how much
  // of the two runs it consumes, and the same figure applies on both sides.
  const shapes = corners.map((corner, i) => {
    const turn = Math.abs(turns[i]);
    if (turn > 170 * DEGREES)
      throw new Error(`Corner ${corner.name} turns too far to fit a vertex`);
    const offsets = rampOffsets(corner.radius, corner.ramp);
    const sweep =
      turn + (corner.revolutions ?? 0) * 2 * Math.PI - 2 * offsets.turn;
    if (sweep < 0)
      throw new Error(`Corner ${corner.name} has no room for its ramps`);
    const end = offsetAt(offsets.entry, 1);
    const shift = end.z - corner.radius * (1 - Math.cos(offsets.turn));
    const reach = end.x - corner.radius * Math.sin(offsets.turn);
    return {
      offsets,
      sweep,
      side: Math.sign(turns[i]) || 1,
      tangent:
        turn > 1e-9 ? reach + (corner.radius + shift) * Math.tan(turn / 2) : 0,
      length: 2 * corner.ramp + corner.radius * sweep,
    };
  });

  type Piece = { length: number; at(s: number): Plan };
  const pieces: Piece[] = [];
  const marks: CornerMark[] = [];
  let travelled = 0;
  const add = (piece: Piece) => {
    pieces.push(piece);
    travelled += piece.length;
  };
  corners.forEach((corner, i) => {
    const previous = (i + corners.length - 1) % corners.length;
    const straight =
      runs[previous] - shapes[previous].tangent - shapes[i].tangent;
    if (straight < 0)
      throw new Error(
        `Corners crowd the run into ${corner.name}: ` +
          `${runs[previous].toFixed(0)}m run holds ` +
          `${(shapes[previous].tangent + shapes[i].tangent).toFixed(0)}m of corner`,
      );
    const entryAngle = Math.atan2(
      directions[previous].z,
      directions[previous].x,
    );
    const begin = {
      x: vertices[i].x - shapes[i].tangent * directions[previous].x,
      z: vertices[i].z - shapes[i].tangent * directions[previous].z,
    };
    const from = {
      x: begin.x - straight * directions[previous].x,
      z: begin.z - straight * directions[previous].z,
    };
    add({
      length: straight,
      at: (s) => ({
        x: from.x + s * directions[previous].x,
        z: from.z + s * directions[previous].z,
      }),
    });
    const { offsets, side, sweep } = shapes[i];
    const enter = travelled;
    add({
      length: corner.ramp,
      at: (s) => {
        const o = offsetAt(offsets.entry, s / corner.ramp);
        return place(begin, entryAngle, { x: o.x, z: side * o.z });
      },
    });
    const pivot = pieces[pieces.length - 1].at(corner.ramp);
    const pivotAngle = entryAngle + side * offsets.turn;
    const centre = place(pivot, pivotAngle, {
      x: 0,
      z: side * corner.radius,
    });
    add({
      length: corner.radius * sweep,
      at: (s) => {
        const turned = (side * s) / corner.radius;
        const cos = Math.cos(turned),
          sin = Math.sin(turned);
        const dx = pivot.x - centre.x,
          dz = pivot.z - centre.z;
        return {
          x: centre.x + dx * cos - dz * sin,
          z: centre.z + dx * sin + dz * cos,
        };
      },
    });
    const leave = pieces[pieces.length - 1].at(corner.radius * sweep);
    const leaveAngle = pivotAngle + side * sweep;
    add({
      length: corner.ramp,
      at: (s) => {
        const o = offsetAt(offsets.exit, s / corner.ramp);
        return place(leave, leaveAngle, { x: o.x, z: side * o.z });
      },
    });
    marks.push({
      name: corner.name,
      enter,
      exit: travelled,
      arc: [enter + corner.ramp, travelled - corner.ramp],
      apex: enter + corner.ramp + (corner.radius * sweep) / 2,
      radius: corner.radius,
      turn: turns[i] / DEGREES,
      straight,
    });
  });

  // One spacing divides the lap exactly, so every node sits the same distance
  // from its neighbours and the spline has no long span to bulge through.
  const count = Math.round(travelled / options.spacing);
  const spacing = travelled / count;
  const points: Plan[] = [];
  let piece = 0,
    consumed = 0;
  for (let i = 0; i < count; i++) {
    const distance = i * spacing;
    while (
      piece < pieces.length - 1 &&
      distance > consumed + pieces[piece].length
    ) {
      consumed += pieces[piece].length;
      piece++;
    }
    points.push(pieces[piece].at(distance - consumed));
  }
  return { points, spacing, length: travelled, marks, vertices, runs };
}

/** Where the drawing crosses itself, as pairs of distances along the lap.
 * A grade-separated circuit needs these: they are the only places where two
 * parts of the road share a plan position and must be held apart by height. */
export function planCrossings(points: Plan[], spacing: number) {
  const side = (a: Plan, b: Plan, c: Plan) =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const count = points.length;
  const found: [number, number][] = [];
  for (let i = 0; i < count; i++)
    for (let j = i + 2; j < count; j++) {
      if (i === 0 && j === count - 1) continue;
      const a = points[i],
        b = points[(i + 1) % count],
        c = points[j],
        d = points[(j + 1) % count];
      if (
        side(a, b, c) * side(a, b, d) < 0 &&
        side(c, d, a) * side(c, d, b) < 0
      ) {
        const u = side(c, d, a) / (side(c, d, a) - side(c, d, b) || 1);
        const v = side(a, b, c) / (side(a, b, c) - side(a, b, d) || 1);
        found.push([(i + u) * spacing, (j + v) * spacing]);
      }
    }
  return found;
}

/** A closed cubic profile through authored heights, continuous in grade and
 * in the rate of change of grade, so the road never kinks over a crest. */
export function elevation(knots: { at: number; y: number }[], period: number) {
  const count = knots.length;
  const spans = knots.map(
    (knot, i) =>
      (i + 1 < count ? knots[i + 1].at : knots[0].at + period) - knot.at,
  );
  if (spans.some((h) => h <= 0))
    throw new Error("Elevation knots must be ordered within the lap");
  const rows = spans.map((h, i) => {
    const previous = (i + count - 1) % count,
      next = (i + 1) % count;
    const row = new Float64Array(count + 1);
    row[previous] += spans[previous];
    row[i] += 2 * (spans[previous] + h);
    row[next] += h;
    row[count] =
      6 *
      ((knots[next].y - knots[i].y) / h -
        (knots[i].y - knots[previous].y) / spans[previous]);
    return row;
  });
  for (let column = 0; column < count; column++) {
    let pivot = column;
    for (let i = column + 1; i < count; i++)
      if (Math.abs(rows[i][column]) > Math.abs(rows[pivot][column])) pivot = i;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let j = column; j <= count; j++) rows[column][j] /= divisor;
    for (let i = 0; i < count; i++) {
      if (i === column) continue;
      const factor = rows[i][column];
      for (let j = column; j <= count; j++)
        rows[i][j] -= factor * rows[column][j];
    }
  }
  const second = rows.map((row) => row[count]);
  return (distance: number) => {
    const s = ((distance % period) + period) % period;
    let i = count - 1;
    for (let j = 0; j < count; j++)
      if (knots[j].at <= s) i = j;
      else break;
    const h = spans[i];
    // The last span wraps past the lap seam, so a station before the first
    // knot belongs to it, one period along.
    const from = s < knots[0].at ? s + period : s;
    const b = (from - knots[i].at) / h,
      a = 1 - b;
    const next = (i + 1) % count;
    return (
      a * knots[i].y +
      b * knots[next].y +
      (((a ** 3 - a) * second[i] + (b ** 3 - b) * second[next]) * (h * h)) / 6
    );
  };
}
