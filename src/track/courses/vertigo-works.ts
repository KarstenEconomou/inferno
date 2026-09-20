import { Vector3 } from "three";
import type { TrackDefinition } from "../compile";
import {
  draftPlan,
  elevation,
  planCrossings,
  type DraftCorner,
} from "../layout";
import { SmoothClosedCurve } from "../smooth-curve";

/** Vertigo Works: an elevated industrial figure eight in four movements.
 *
 * One idea runs through the whole lap. Every signature of this circuit is the
 * same move at a different amplitude — the road turns about its own axis and
 * then holds that attitude through a long constant-radius arc. The wall ride
 * holds a quarter turn, the helix holds half of one while it spirals down a
 * tower, the switchbacks hold a hard lean through two linked hairpins, and
 * the ceiling holds a full half turn upside down. Between them the road is
 * always either winding a bank on or holding it; it never snatches.
 *
 * The drawing is a closed polygon of corner marks. `draftPlan` replaces each
 * mark with a curvature ramp, a constant-radius arc and a second ramp, so
 * curvature never steps and the deck cannot ripple. Elevation is a separate
 * closed cubic profile in the same distances.
 */
const corners: DraftCorner[] = [
  // The west lobe, taken as one long right-hand loop. The list begins at the
  // first corner after the timing line, so lap distance starts on a straight.
  { name: "north-gate", at: [-440, -80], radius: 155, ramp: 45 },
  { name: "wall", at: [-230, -380], radius: 200, ramp: 60 },
  // The east lobe, taken as one long left-hand loop, with the tower in it.
  { name: "helix", at: [216, 120], radius: 60, ramp: 48, revolutions: 1 },
  { name: "east-sweep", at: [446, 132], radius: 150, ramp: 45 },
  { name: "upper-hairpin", at: [545, -235], radius: 37, ramp: 85 },
  { name: "lower-hairpin", at: [244, 84], radius: 42, ramp: 70 },
  { name: "ridge", at: [366, -310], radius: 90, ramp: 42 },
  { name: "ceiling", at: [80, -256], radius: 175, ramp: 50 },
  { name: "underpass", at: [-170, 250], radius: 150, ramp: 45 },
  { name: "gallery", at: [-430, 240], radius: 110, ramp: 45 },
];
const plan = draftPlan(corners, { spacing: 16 });
const mark = (name: string) => plan.marks.find((m) => m.name === name)!;
const wall = mark("wall"),
  helix = mark("helix"),
  upper = mark("upper-hairpin"),
  lower = mark("lower-hairpin"),
  ridge = mark("ridge"),
  ceiling = mark("ceiling"),
  under = mark("underpass");

/** Heights in metres at distances around the drawing. The lap climbs from the
 * timing line to the crossing above everything, spirals down the tower, steps
 * down the switchbacks and runs home underneath itself. */
const height = elevation(
  [
    { at: 0, y: 95 },
    { at: 120, y: 100 },
    { at: 280, y: 122 },
    { at: 430, y: 158 },
    { at: 620, y: 210 },
    { at: 700, y: 226 },
    { at: 790, y: 236 },
    { at: 900, y: 233 },
    { at: 1030, y: 226 },
    { at: 1180, y: 208 },
    { at: 1340, y: 186 },
    { at: 1500, y: 168 },
    { at: 1620, y: 156 },
    { at: 1780, y: 134 },
    { at: 1930, y: 112 },
    { at: 2080, y: 90 },
    { at: 2240, y: 68 },
    { at: 2440, y: 52 },
    { at: 2620, y: 45 },
    { at: 2790, y: 42 },
    { at: 2880, y: 42 },
    { at: 3000, y: 52 },
    { at: 3120, y: 68 },
    { at: 3240, y: 82 },
    { at: 3360, y: 92 },
  ],
  plan.length,
);
const nodes = plan.points.map(
  (p, i) => [p.x, height(i * plan.spacing), p.z] as [number, number, number],
);

// Markers are authored as distances around the drawing. The compiled road is
// slightly longer than the drawing because it climbs, so every distance is
// converted through the same curve the compiler will build.
const authored = new SmoothClosedCurve(nodes.map((n) => new Vector3(...n)));
const divisions = 32000;
const distances = authored.getLengths(divisions),
  total = distances[divisions];
function station(index: number) {
  const p = authored.nodeParameter(index) * divisions,
    i = Math.floor(p);
  if (i >= divisions) return 1;
  return (distances[i] + (distances[i + 1] - distances[i]) * (p - i)) / total;
}
/** Lap fraction at a distance around the drawing. */
const at = (distance: number) => station(distance / plan.spacing);
const zone = <T>(start: number, end: number, rest: T) => ({
  ...rest,
  start: at(start),
  end: at(end),
});

// The one place where the two lobes share a plan position is the crossover.
// The helix also passes over itself; that pair sits much closer together.
const crossover = planCrossings(plan.points, plan.spacing).sort(
  (a, b) => b[1] - b[0] - (a[1] - a[0]),
)[0];

/** Distances of the four sector gates and the two gaps, on the drawing. */
const gates = [745, helix.exit + 14, lower.exit + 6];
const hop: [number, number] = [784, 796];
const leap: [number, number] = [ceiling.exit + 164, ceiling.exit + 185];

export const vertigoWorks: TrackDefinition = {
  id: "vertigo-works-9",
  name: "Vertigo Works",
  nodes,
  curveType: "smooth",
  width: 21,
  startPlatform: { halfLength: 24, blendLength: 65 },
  banking: { max: 0.95, strength: 2.4 },
  resolution: 1400,
  checkpoints: gates.map(at),
  sectors: [
    {
      name: "THE CLIMB",
      description:
        "Timing line to the crossover: a rising sweep that stands the road on its edge for the wall ride, then crests over the whole works.",
    },
    {
      name: "THE HELIX",
      description:
        "A hop off the summit into the tower: one full banked revolution, held at the same angle the whole way down.",
    },
    {
      name: "THE SWITCHBACKS",
      description:
        "Two linked hairpins stepping down the east face. The widest road on the circuit, cut for a slide.",
    },
    {
      name: "THE UNDERWORKS",
      description:
        "Inverted along the ceiling, out under the crossover, over the long gap and back up the gallery to the line.",
    },
  ],
  boosts: [
    at(60), // Launch straight: speed before the road turns on its edge.
    at(wall.exit), // Off the wall and onto the crest.
    at(1000), // Landed from the hop, committing to the tower.
    at(helix.exit + 40), // Out of the helix, into the east sweep.
    at(ridge.exit + 14), // Switchbacks done, pointing at the ceiling.
    at(leap[0] - 60), // Under the crossover, winding up for the long gap.
    at(under.exit + 96), // Final climb to the line.
  ],
  gaps: [hop.map(at) as [number, number], leap.map(at) as [number, number]],
  jumpProfiles: [
    { rampLength: 28, rampHeight: 2.2, extraWidth: 12, widthBlend: 190 },
    { rampLength: 48, rampHeight: 4.6, extraWidth: 14, widthBlend: 150 },
  ],
  crossings: [at(crossover[0]), at(crossover[1])],
  widthZones: [
    // The road opens where the car is asked to change attitude, and again
    // where it is asked to place a slide.
    zone(wall.enter, wall.exit, { width: 25, blend: 70 }),
    zone(helix.enter - 230, helix.exit, { width: 27, blend: 90 }),
    zone(1700, 2250, { width: 34, blend: 70 }),
    zone(ceiling.enter - 80, ceiling.exit + 140, { width: 30, blend: 80 }),
    zone(leap[1] + 10, under.exit + 40, { width: 29, blend: 60 }),
  ],
  bankZones: [
    // Every zone leans the way the corner already leans, so the road only
    // ever carries a lean further; it never rolls back through flat.
    // The wall: a quarter turn, held for the length of the arc.
    zone(wall.enter - 20, wall.exit + 20, { angle: Math.PI / 2, blend: 110 }),
    // The tower: one angle for one revolution, wound on over a long ramp.
    zone(helix.enter, helix.exit, { angle: -0.95, blend: 85 }),
    // The switchbacks lean, but far less than the curvature alone would ask
    // for. A hairpin banked to the limit simply grips; this one has to be
    // placed, and it rewards a slide.
    zone(upper.enter, upper.exit, { angle: -0.45, blend: 60 }),
    zone(lower.enter, lower.exit, { angle: 0.45, blend: 60 }),
    // The ceiling: the same lean taken all the way to a half turn, so the
    // deck ends up overhead, and let go of before the road runs underneath
    // the crossover.
    zone(ceiling.enter - 60, ceiling.exit + 40, { angle: -Math.PI, blend: 95 }),
  ],
  // The reference roll is pinned to world up at regular stations, so the
  // transported frame cannot drift and every lean is one the course asked for.
  frameAnchors: Array.from({ length: 34 }, (_, i) => ({
    t: i === 33 ? 1 : at((i * plan.length) / 33),
    up: [0, 1, 0] as [number, number, number],
  })),
  features: [
    { kind: "wallride", start: at(wall.enter), end: at(wall.exit) },
    { kind: "helix", start: at(helix.enter), end: at(helix.exit) },
    { kind: "hairpin", start: at(upper.arc[0] - 55), end: at(upper.exit + 25) },
    { kind: "hairpin", start: at(lower.enter - 25), end: at(lower.exit + 25) },
    {
      kind: "inverted",
      start: at(ceiling.enter - 60),
      end: at(ceiling.exit + 40),
    },
  ],
  lessons: [
    {
      id: "boost",
      start: at(20),
      end: at(52),
      title: "BOOST PAD",
      detail: "DRIVE OVER THE CHEVRONS",
    },
    {
      id: "hop",
      start: at(700),
      end: at(748),
      title: "SMALL HOP AHEAD",
      detail: "HOLD W · TAP BRAKE TO ARREST PITCH",
    },
    {
      id: "drift",
      start: at(upper.enter - 130),
      end: at(upper.enter - 60),
      title: "STEER, THEN BRAKE TO SLIDE",
      detail: "RELEASE TO GRIP · BRAKING ALSO WORKS",
    },
    {
      id: "jump",
      start: at(leap[0] - 160),
      end: at(leap[0] - 90),
      title: "BOOST + JUMP",
      detail: "BRAKE ARRESTS PITCH · COUNTERSTEER CANCELS SPIN",
    },
  ],
  landmarks: [
    { kind: "cantilever", start: at(40), count: 6, spacing: at(54) - at(40) },
    {
      kind: "pipe-bridge",
      start: at(920),
      count: 3,
      spacing: at(934) - at(920),
    },
    {
      kind: "rib-vault",
      start: at(leap[1] + 50),
      count: 7,
      spacing: at(leap[1] + 64) - at(leap[1] + 50),
    },
  ],
  gallery: {
    start: at(under.enter + 62),
    count: 12,
    spacing: at(under.enter + 82) - at(under.enter + 62),
  },
};
