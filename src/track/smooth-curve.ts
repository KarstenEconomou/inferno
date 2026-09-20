import { Curve, Vector3 } from "three";

/** Periodic cubic spline through every authored node, with chord-length
 * knots. Position, tangent and curvature agree at each node and at the seam.
 *
 * A Catmull-Rom curve can step the lateral or the vertical acceleration when
 * the car enters the next span. This curve cannot, and it keeps every node on
 * the road. */
export class SmoothClosedCurve extends Curve<Vector3> {
  private points: Vector3[];
  private knots: number[];
  private second: Vector3[];

  constructor(points: Vector3[]) {
    super();
    this.points = points.map((p) => p.clone());
    const count = points.length;
    const spans = points.map((p, i) => p.distanceTo(points[(i + 1) % count]));
    if (spans.some((h) => h < 1e-6))
      throw new Error(
        "Smooth course nodes must be distinct from their neighbors",
      );
    const perimeter = spans.reduce((sum, h) => sum + h, 0);
    this.knots = [0];
    for (const h of spans) this.knots.push(this.knots.at(-1)! + h / perimeter);
    this.knots[count] = 1;
    // Solve the periodic system of second derivatives once, when the course
    // compiles. A dense solve with pivoting is small for an authored course,
    // and it closes the loop without a special rule at the seam.
    const rows = spans.map((h, i) => {
      const prev = (i + count - 1) % count,
        next = (i + 1) % count;
      const row = new Float64Array(count + 3);
      row[prev] = spans[prev];
      row[i] = 2 * (spans[prev] + h);
      row[next] = h;
      const rhs = points[next]
        .clone()
        .sub(points[i])
        .divideScalar(h)
        .sub(points[i].clone().sub(points[prev]).divideScalar(spans[prev]))
        .multiplyScalar(6);
      row.set(rhs.toArray(), count);
      return row;
    });
    for (let column = 0; column < count; column++) {
      let pivot = column;
      for (let i = column + 1; i < count; i++)
        if (Math.abs(rows[i][column]) > Math.abs(rows[pivot][column]))
          pivot = i;
      [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
      const divisor = rows[column][column];
      for (let j = column; j < count + 3; j++) rows[column][j] /= divisor;
      for (let i = 0; i < count; i++) {
        if (i === column) continue;
        const factor = rows[i][column];
        for (let j = column; j < count + 3; j++)
          rows[i][j] -= factor * rows[column][j];
      }
    }
    // getPoint uses normalised knot distances. Convert the derivatives from
    // metres to that scale.
    this.second = rows.map((row) =>
      new Vector3(...row.slice(count)).multiplyScalar(perimeter * perimeter),
    );
    this.arcLengthDivisions = 32000;
  }

  nodeParameter(index: number) {
    if (index >= this.points.length) return 1;
    const i = Math.floor(index),
      u = index - i;
    return this.knots[i] + (this.knots[i + 1] - this.knots[i]) * u;
  }

  private span(t: number) {
    const u = ((t % 1) + 1) % 1;
    let low = 0,
      high = this.points.length;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if (this.knots[mid] <= u) low = mid;
      else high = mid;
    }
    const h = this.knots[low + 1] - this.knots[low];
    return {
      i: low,
      j: (low + 1) % this.points.length,
      h,
      b: (u - this.knots[low]) / h,
    };
  }

  override getPoint(t: number, target = new Vector3()) {
    const { i, j, h, b } = this.span(t),
      a = 1 - b;
    return target
      .copy(this.points[i])
      .multiplyScalar(a)
      .addScaledVector(this.points[j], b)
      .addScaledVector(this.second[i], ((a * a * a - a) * h * h) / 6)
      .addScaledVector(this.second[j], ((b * b * b - b) * h * h) / 6);
  }

  override getTangent(t: number, target = new Vector3()) {
    const { i, j, h, b } = this.span(t),
      a = 1 - b;
    return target
      .copy(this.points[j])
      .sub(this.points[i])
      .divideScalar(h)
      .addScaledVector(this.second[i], ((1 - 3 * a * a) * h) / 6)
      .addScaledVector(this.second[j], ((3 * b * b - 1) * h) / 6)
      .normalize();
  }
}
