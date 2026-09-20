import { Vector3 } from "three";
import type { TrackDefinition } from "../compile";
import {
  draftPlan,
  elevation,
  type CornerMark,
  type DraftCorner,
} from "../layout";
import { SmoothClosedCurve } from "../smooth-curve";

/** Burnline: a desert proving ground where the road is not the whole course.
 *
 * One idea runs through this lap. The graded corridor is far wider than the
 * asphalt painted through it, and that paint is a surveyor's line rather than
 * a racing line. Open ground still carries the car, with less cornering grip
 * and more drag, so leaving the asphalt is a decision and never an escape.
 * The lakebed teaches it at three hundred, the mesa offers one plain dirt
 * apex, and two authored cuts on the way home pay for it properly.
 *
 * The drawing is a closed polygon of corner marks. `draftPlan` replaces each
 * mark with a curvature ramp, a constant-radius arc and a second ramp, so the
 * camber sweeps rather than steps. Elevation is a separate closed cubic
 * profile in the same distances.
 */
const corners: DraftCorner[] = [
  // The lakebed: two enormous opposed bends held at full speed. The paint
  // keeps to the outside of each, so the chord between them is open ground.
  { name: "lake-north", at: [235, 361], radius: 420, ramp: 90 },
  { name: "lake-south", at: [694, 40], radius: 400, ramp: 90 },
  // The foot of the mesa: the one hard corner of the opening half.
  { name: "mesa-gate", at: [1100, 149], radius: 48, ramp: 22 },
  { name: "shelf", at: [1218, -151], radius: 115, ramp: 48 },
  // The dirt apex, and the saddle that sets the entry speed for the canyon.
  { name: "dirt-apex", at: [857, -470], radius: 62, ramp: 32 },
  { name: "radar-saddle", at: [664, -353], radius: 45, ramp: 20 },
  // Off the landing slope, then hard into the installation.
  { name: "canyon-run", at: [90, -592], radius: 190, ramp: 55 },
  { name: "gatehouse", at: [-386, -523], radius: 46, ramp: 34 },
  { name: "blast-channel", at: [-386, -372], radius: 32, ramp: 26 },
  { name: "bunker-mouth", at: [-622, -372], radius: 42, ramp: 24 },
  // The two cuts that decide a lap, and then the run home.
  { name: "west-sweep", at: [-823, -204], radius: 100, ramp: 44 },
  { name: "rim", at: [-722, 101], radius: 135, ramp: 52 },
  { name: "lakebed-gate", at: [-101, 302], radius: 420, ramp: 48 },
];
const plan = draftPlan(corners, { spacing: 16 });
const mark = (name: string) => plan.marks.find((m) => m.name === name)!;
const north = mark("lake-north"),
  south = mark("lake-south"),
  dirt = mark("dirt-apex"),
  sweep = mark("west-sweep"),
  rimBend = mark("rim");

/** Heights in metres at distances around the drawing. The lap starts on the
 * lakebed, climbs a hundred and forty metres through the mesas, leaves a
 * level lip over the canyon, falls down the landing slope to the installation
 * and gives the whole height back on the way home. */
const height = elevation(
  [
    { at: 0, y: 16 },
    { at: 140, y: 14 },
    { at: 320, y: 11 },
    { at: 560, y: 10 },
    { at: 800, y: 11 },
    { at: 980, y: 15 },
    { at: 1100, y: 20 },
    // The climb: a hundred and thirty-five metres at a steady one in nine,
    // flattening out over the last stretch into the lip.
    { at: 1171, y: 26 },
    { at: 1300, y: 42 },
    { at: 1430, y: 59 },
    { at: 1560, y: 76 },
    { at: 1690, y: 93 },
    { at: 1820, y: 109 },
    { at: 1950, y: 124 },
    { at: 2070, y: 136 },
    { at: 2180, y: 146 },
    { at: 2280, y: 155 },
    { at: 2364, y: 161 },
    // The landing slope falls away faster than the flight does. A fast entry
    // lands a long way down it; a slow one lands early, safe and slow.
    { at: 2464, y: 149 },
    { at: 2564, y: 133 },
    { at: 2664, y: 118 },
    { at: 2780, y: 107 },
    { at: 2900, y: 100 },
    { at: 3060, y: 97 },
    { at: 3260, y: 95 },
    { at: 3470, y: 94 },
    { at: 3630, y: 95 },
    { at: 3740, y: 97 },
    { at: 3830, y: 101 },
    // The embankment. The paint goes round it; the cut goes over it.
    { at: 3910, y: 106 },
    { at: 4000, y: 99 },
    { at: 4110, y: 90 },
    { at: 4270, y: 76 },
    { at: 4450, y: 58 },
    { at: 4610, y: 40 },
    // The run-out onto the lakebed is nearly level, so the flat timing
    // platform does not have to fight a grade at the line.
    { at: 4740, y: 26 },
    { at: 4840, y: 18 },
  ],
  plan.length,
);
const nodes = plan.points.map(
  (p, i) => [p.x, height(i * plan.spacing), p.z] as [number, number, number],
);

// Markers are authored as distances around the drawing. The compiled road is
// slightly longer because it climbs, so every distance is converted through
// the same curve the compiler will build.
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
/** Which way the paint leans at a corner. The centre of an arc lies on the
 * side its plan turn names, and the road frame's right points that way, so
 * the outside of the bend — where the surveyor put the asphalt — is the
 * other one. */
const outward = (corner: CornerMark) => -Math.sign(corner.turn);

/** Distances of the four sector gates and of the canyon, on the drawing. */
const gates = [1100, 2110, 3020, 3730];
const canyon: [number, number] = [2364, 2406];

/** The painted lane: its centre and half its width, in metres, at distances
 * around the drawing. Where the paint leaves the middle of the corridor it
 * opens the inside of a corner as an authored racing line. */
const paint: [number, number, number][] = [
  [0, 0, 7.5],
  [100, 0, 7.5],
  // The lakebed. The paint holds the outside of both bends, so the diagonal
  // straight across the middle of the corridor is always open ground.
  [190, 8 * outward(north), 7.5],
  [280, 14 * outward(north), 7.5],
  [390, 14 * outward(north), 7.5],
  [470, 8 * outward(north), 7.5],
  [560, 0, 7.5],
  [660, 8 * outward(south), 7.5],
  [760, 14 * outward(south), 7.5],
  [900, 14 * outward(south), 7.5],
  [1000, 8 * outward(south), 7.5],
  [1100, 0, 7.5],
  [1350, 0, 8.5],
  [1600, 0, 8.5],
  // Cut 1. An obvious dirt apex: the road bows out, the ground does not.
  [1780, 4 * outward(dirt), 7.5],
  [1900, 7 * outward(dirt), 7.5],
  [1985, 9 * outward(dirt), 7.5],
  [2060, 5 * outward(dirt), 7.5],
  [2140, 0, 8],
  [2320, 0, 9],
  [2480, 0, 10],
  [2700, 0, 10],
  [2880, 0, 8],
  [3060, 0, 7.5],
  [3400, 0, 7.5],
  [3640, 0, 7.5],
  [3730, 0, 7.5],
  [3790, 0, 7.5],
  // Cut 2. The paint runs round the bunker field; the embankment crosses it.
  [3850, 8 * outward(sweep), 7.5],
  [3915, 14 * outward(sweep), 7.5],
  [3980, 11 * outward(sweep), 7.5],
  [4060, 4 * outward(sweep), 7.5],
  // Cut 3. The paint leaves the rim of the wash. Nothing says it must.
  [4160, 10 * outward(rimBend), 7.5],
  [4220, 14 * outward(rimBend), 7.5],
  [4300, 9 * outward(rimBend), 7.5],
  [4420, 0, 8],
  [4650, 0, 7.5],
  [4850, 0, 7.5],
];

export const burnline: TrackDefinition = {
  id: "burnline-1",
  name: "Burnline",
  nodes,
  curveType: "smooth",
  scenery: "desert",
  // The narrowest road on the circuit is the concrete channel through the
  // installation. Everywhere else the corridor opens out from it.
  width: 17,
  startPlatform: { halfLength: 30, blendLength: 90 },
  banking: { max: 0.3, strength: 1.3 },
  resolution: 1900,
  checkpoints: gates.map(at),
  sectors: [
    {
      name: "DRY LAKE",
      description:
        "One enormous arc across the lakebed at full speed. The paint holds the outside of it; the short way is open ground, and the exit decides the mesa gate.",
    },
    {
      name: "MESA CLIMB",
      description:
        "A hundred and forty metres of climb in four linked corners, with one dirt apex offered plainly enough to teach what the rest of the map is about.",
    },
    {
      name: "CANYON JUMP",
      description:
        "A level lip beneath the big dish and a falling landing slope. The saddle before it sets the entry speed, and entry speed is the whole jump.",
    },
    {
      name: "RESEARCH STATION",
      description:
        "The one narrow place on the circuit: hard braking into square concrete turns between blast walls, poured flat, with no camber to help.",
    },
    {
      name: "THE DESCENT",
      description:
        "The embankment, the rim of the wash and a kilometre of falling desert straight to the line. A good exit is paid out the whole way down.",
    },
  ],
  lane: {
    marks: paint.map(([d, offset, halfWidth]) => ({
      at: at(d),
      offset,
      halfWidth,
    })),
    // Open ground turns the car less willingly and holds it back a little.
    // Both figures belong to the course, so a cut repeats exactly.
    grip: 0.9,
    drag: 0.5,
    blend: 1.6,
  },
  boosts: [
    at(80), // Off the grid and onto the lakebed.
    at(820), // Mid-bend, on the paint: the pad or the short way, not both.
    at(2065), // Out of the dirt apex, pointing at the saddle.
    at(2310), // The last fifty metres before the lip.
    at(2680), // Landed, straightened and running down the slope.
    at(3540), // The concrete channel, between the square turns.
    at(4480), // Both lines are back together: the descent begins.
  ],
  gaps: [canyon.map(at) as [number, number]],
  jumpProfiles: [
    { rampLength: 54, rampHeight: 4.4, extraWidth: 12, widthBlend: 160 },
  ],
  widthZones: [
    // Each zone starts inside the one before it, so the corridor tapers from
    // one width into the next instead of pinching between them.
    zone(20, 1110, { width: 46, blend: 130 }), // the lakebed
    zone(950, 1910, { width: 25, blend: 110 }), // the climb
    zone(1740, 2120, { width: 34, blend: 85 }), // cut 1
    zone(2040, 2380, { width: 26, blend: 85 }), // the run to the lip
    zone(2320, 2880, { width: 30, blend: 100 }), // the landing slope
    zone(2770, 3220, { width: 22, blend: 95 }), // into the installation
    zone(3750, 4120, { width: 48, blend: 105 }), // cut 2
    zone(4000, 4790, { width: 46, blend: 115 }), // cut 3 and the descent
  ],
  bankZones: [
    // The installation is poured flat. Its corners are square, and the only
    // thing that takes the car round them is the brake.
    zone(3220, 3710, { angle: 0, blend: 60 }),
  ],
  // The reference roll is pinned to world up at regular stations, so no
  // transported twist can drift into a deck that never turns over.
  frameAnchors: Array.from({ length: 28 }, (_, i) => ({
    t: i === 27 ? 1 : at((i * plan.length) / 27),
    up: [0, 1, 0] as [number, number, number],
  })),
  features: [
    { kind: "sweeper", start: at(north.enter), end: at(south.exit) },
    { kind: "terrain-cut", start: at(1740), end: at(2120) },
    { kind: "jump", start: at(2220), end: at(2820) },
    { kind: "terrain-cut", start: at(3790), end: at(4100) },
    { kind: "terrain-cut", start: at(4100), end: at(4420) },
  ],
  lessons: [
    {
      id: "open-ground",
      start: at(100),
      end: at(200),
      title: "THE GROUND IS THE COURSE",
      detail: "OFF THE PAINT: LESS GRIP, SHORTER WAY",
    },
    {
      id: "jump",
      start: at(2100),
      end: at(2210),
      title: "BOOST + CANYON JUMP",
      detail: "STRAIGHTEN EARLY · BRAKE ARRESTS PITCH",
    },
    {
      id: "brake",
      start: at(2900),
      end: at(3010),
      title: "SQUARE TURNS AHEAD",
      detail: "BRAKE IN A STRAIGHT LINE · NO CAMBER TO HELP",
    },
  ],
};
