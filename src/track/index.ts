import { createTrack } from "./compile";
import { courses, DEFAULT_COURSE } from "./courses";

export type {
  JumpSettings,
  LaneMark,
  LaneSettings,
  RoadContact,
  RoadFrame,
  TrackDefinition,
} from "./compile";

/** The selected course. The simulation, the renderer, the collision mesh and
 * the interface all read the road through this one facade.
 *
 * Author course data in courses/. Keep the geometry algorithms in compile.ts
 * and the schema checks in validate.ts.
 *
 * One course is selected at a time. `selectCourse` swaps it before a run
 * begins; everything that holds work derived from the road registers with
 * `onCourseChange` and builds that work again. Nothing swaps the course while
 * a car is moving. */
export type Course = ReturnType<typeof createTrack>;
const compiled = new Map<string, Course>();
function compile(id: string) {
  let existing = compiled.get(id);
  if (!existing)
    compiled.set(
      id,
      (existing = createTrack(courses[id] ?? courses[DEFAULT_COURSE])),
    );
  return existing;
}

export let course = compile(DEFAULT_COURSE);
export let track = course.track;
export let length = course.length;
export let samples = course.samples;
export let deckSegments = course.deckSegments;
/** Records compare only within one course and one set of handling constants.
 * A change to either invalidates the saved ghosts. */
export let TRACK_VERSION = `${track.id}/handling-15`;

/** Course-derived work held elsewhere: collision strips, boost pad frames,
 * the minimap outline and the scenery. Each listener rebuilds its own. */
const listeners = new Set<() => void>();
export function onCourseChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function selectCourse(id: string) {
  const next = compile(id);
  if (next === course) return course;
  course = next;
  track = course.track;
  length = course.length;
  samples = course.samples;
  deckSegments = course.deckSegments;
  TRACK_VERSION = `${track.id}/handling-15`;
  for (const listener of listeners) listener();
  return course;
}
/** Id of the circuit whose course is selected. */
export const selectedCourse = () => track.id;
/** Another circuit's course, compiled but not selected. The selection sheet
 * draws a plan of a circuit it is not about to build. */
export const courseFor = (id: string) => compile(id);
/** Circuit ids with authored geometry. */
export const authoredCourses = Object.keys(courses);

export const wrap = (t: number) => course.wrap(t);
export const point = (t: number) => course.point(t);
export const roadWidth = (t: number) => course.roadWidth(t);
export const lane = (t: number) => course.lane(t);
export const paved = (t: number, lateral: number) => course.paved(t, lateral);
export const surfaceGrip = (t: number, lateral: number) =>
  course.surfaceGrip(t, lateral);
export const surfaceDrag = (t: number, lateral: number) =>
  course.surfaceDrag(t, lateral);
export const frame = (t: number) => course.frame(t);
export const surface = (
  t: number,
  lateral?: number,
  known?: Parameters<Course["surface"]>[2],
) => course.surface(t, lateral, known);
export const inGap = (t: number) => course.inGap(t);
export const nearest = (p: Parameters<Course["nearest"]>[0], hint?: number) =>
  course.nearest(p, hint);
