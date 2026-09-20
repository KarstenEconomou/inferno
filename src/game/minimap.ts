import type { Vector3 } from "three";
import { course as selected, type Course } from "../track";

/** Drawing area of the minimap, in SVG user units. */
const VIEW = { width: 235, height: 140 };
const PLAN = { width: 225, height: 130 };
const CENTRE = { x: 117.5, y: 70 };
/** Number of course stations that the outline uses. */
const OUTLINE_STEPS = 240;

/** Flat course outline for the track-select card and the head-up display.
 * The plan is computed once, because the course does not change during a
 * session. It is rotated a quarter turn when the course is longer north to
 * south than east to west, so that the outline fills the available area. */
export class Minimap {
  private readonly rotated: boolean;
  private readonly scale: number;
  private readonly midX: number;
  private readonly midZ: number;
  private readonly path: string;
  private readonly course: Course;

  constructor(course: Course = selected) {
    this.course = course;
    const { samples, point } = course;
    const x = samples.map((s) => s.p.x),
      z = samples.map((s) => s.p.z);
    const minX = Math.min(...x),
      maxX = Math.max(...x);
    const minZ = Math.min(...z),
      maxZ = Math.max(...z);
    this.midX = (minX + maxX) / 2;
    this.midZ = (minZ + maxZ) / 2;
    this.rotated = maxZ - minZ > maxX - minX;
    const across = this.rotated ? maxZ - minZ : maxX - minX;
    const along = this.rotated ? maxX - minX : maxZ - minZ;
    this.scale = Math.min(PLAN.width / across, PLAN.height / along);
    const outline = Array.from({ length: OUTLINE_STEPS + 1 }, (_, i) =>
      this.coordinates(point(i / OUTLINE_STEPS)),
    );
    this.path = outline
      .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
      .join(" ");
  }

  /** Project a world position onto the plan. */
  coordinates(p: Vector3): [number, number] {
    const x = p.x - this.midX,
      z = p.z - this.midZ;
    return [
      (this.rotated ? z : x) * this.scale + CENTRE.x,
      (this.rotated ? -x : z) * this.scale + CENTRE.y,
    ];
  }

  /** Transform that puts the car mark on the plan, pointing where the car
   * points. The plan shares the quarter turn that the outline uses. */
  markerTransform(position: Vector3, heading: Vector3) {
    const [x, y] = this.coordinates(position);
    const dx = this.rotated ? heading.z : heading.x;
    const dy = this.rotated ? -heading.x : heading.z;
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`;
  }

  /** Markup for the outline. Every drawing of the course carries its timing
   * line and all of its checkpoints, in the order the road meets them; only
   * the car is optional, because only a held run has one to draw. */
  svg(className: string, car = false) {
    const point = this.course.point;
    const gates = [0, ...this.course.track.checkpoints]
      .map((t, i) => {
        const [x, y] = this.coordinates(point(t));
        return `<circle class="map-gate${i ? "" : " map-start"}" data-gate="${i}" r="3" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}"><title>${i ? `Checkpoint ${i}` : "Start and finish"}</title></circle>`;
      })
      .join("");
    return `<svg class="${className}" viewBox="0 0 ${VIEW.width} ${VIEW.height}" aria-label="Circuit map"><path d="${this.path}"/>${gates}${
      car ? '<polygon id="map-marker" points="0,-13 8,9 0,5 -8,9"/>' : ""
    }</svg>`;
  }
}
