import * as THREE from "three";
import { assetIntersections, drivingEnvelope } from "../../track/clearance";
import {
  course,
  frame,
  inGap,
  length,
  roadWidth,
  samples,
  track,
} from "../../track";
import { align, box } from "../geometry";
import { fascia, paint } from "../environment/surfaces";
import { buildGround } from "./terrain";
import {
  antennaArray,
  blastWall,
  bunker,
  mesa,
  microwaveTower,
  portal,
  pylon,
  radarDish,
  serviceRoad,
} from "./structures";

export { buildGround } from "./terrain";

/** Height of the guardrail the car strikes at the edge of the corridor, in
 * metres. It matches the rail the simulation sweeps against. */
const RAIL = 1.8;

/** The proving ground around the circuit.
 *
 * Everything is placed relative to the road, because everything here has a
 * job: the pylon line is what the lakebed is aimed along, the big dish is
 * what the canyon jump is aimed under, the mast on the shelf marks the dirt
 * apex, and the walls tell the driver where the braking starts. Placement is
 * in lap distance and lateral offset, so a change to the course carries the
 * landmarks with it.
 */

/** A structure, stated the way the circuit thinks about it. */
type Placement = {
  /** Distance around the lap, in metres. */
  at: number;
  /** Offset from the middle of the road, in metres. Right of the lap is
   * positive. */
  side: number;
  /** Height above the ground under it, in metres. */
  lift?: number;
  /** Rotation about the road normal, in radians. */
  turn?: number;
  build: () => THREE.Object3D;
};

/** The whole proving ground: the floor it stands on, and the things standing
 * on it. The two are separate children because only the second can be tested
 * against the driving envelope — a heightfield spans the course by
 * definition, and is held below the deck by its own grading instead. */
export function buildDesert() {
  const world = new THREE.Group();
  world.name = "desert";
  const root = new THREE.Group();
  root.name = "desert-structures";
  const ground = buildGround();
  world.add(ground.root, root);
  const envelope = drivingEnvelope(course);

  /** Put one piece on the ground beside the road, upright, and keep it only
   * if it stands clear of the driving envelope. */
  const place = ({ at, side, lift = 0, turn = 0, build }: Placement) => {
    const f = frame(at / length);
    const anchor = f.p.clone().addScaledVector(f.right, side);
    const object = build();
    object.position.set(
      anchor.x,
      ground.height(anchor.x, anchor.z) + lift,
      anchor.z,
    );
    object.rotation.y =
      Math.atan2(f.forward.x, f.forward.z) + turn + (side < 0 ? Math.PI : 0);
    if (assetIntersections(object, envelope).length) return null;
    root.add(object);
    return object;
  };

  // The pylon line. It is straight where the road is not, so it gives the
  // lakebed the one fixed edge a driver can aim along at three hundred.
  const start = frame(0.004),
    exit = frame(1000 / length);
  const from = start.p.clone().addScaledVector(start.right, -210);
  const to = exit.p.clone().addScaledVector(exit.right, -240);
  for (let i = 0; i <= 11; i++) {
    const p = from
      .clone()
      .lerp(to, i / 11)
      .addScaledVector(to.clone().sub(from).normalize(), 260);
    const tower = pylon(78);
    tower.position.set(p.x, ground.height(p.x, p.z), p.z);
    tower.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) + Math.PI / 2;
    if (!assetIntersections(tower, envelope).length) root.add(tower);
  }

  const gap = track.gaps[0];
  const canyonAt = gap ? ((gap[0] + gap[1]) / 2) * length : length / 2;
  const placements: Placement[] = [
    // The signature: the big dish stands over the canyon, on the far side,
    // and is the aiming mark for the whole approach.
    { at: canyonAt + 150, side: 132, build: () => radarDish(58) },
    { at: canyonAt - 340, side: -96, build: () => radarDish(21) },
    // The mesa country above the climb.
    { at: 1560, side: 168, build: () => microwaveTower(150) },
    { at: 1990, side: 124, build: () => microwaveTower(96) },
    { at: 2260, side: -140, build: () => microwaveTower(120) },
    // The installation. The walls stand close enough to the concrete to be
    // the braking reference, and the portals give the place a roofline. The
    // channel turns square corners, so a wall is short and stands back: a
    // long one laid beside one turn reaches across the next.
    { at: 3230, side: 24, build: () => blastWall(26, 9) },
    { at: 3300, side: -25, turn: 0.4, build: () => blastWall(24, 12) },
    { at: 3400, side: 31, turn: 1.3, build: () => blastWall(34, 9) },
    { at: 3480, side: -24, turn: 0.2, build: () => blastWall(24, 13) },
    { at: 3560, side: 30, turn: 1.5, build: () => blastWall(32, 10) },
    { at: 3640, side: -31, build: () => blastWall(34, 9) },
    { at: 3700, side: 25, turn: 1.1, build: () => blastWall(24, 12) },
    { at: 3300, side: 0, build: () => portal(46, 22, 9) },
    { at: 3520, side: 0, build: () => portal(40, 21, 11) },
    { at: 3690, side: 0, build: () => portal(44, 22, 9) },
    { at: 3270, side: 42, build: () => bunker(34, 26, 11) },
    { at: 3400, side: -46, build: () => bunker(28, 22, 9) },
    { at: 3600, side: 48, build: () => bunker(40, 24, 13) },
    { at: 3160, side: -52, build: () => bunker(24, 20, 8) },
    { at: 3760, side: -44, build: () => bunker(32, 24, 10) },
    { at: 3420, side: -128, build: () => antennaArray(6, 10, 13) },
    { at: 3020, side: 74, build: () => bunker(30, 22, 10) },
    // The embankment and the rim of the wash.
    { at: 4050, side: 62, build: () => bunker(26, 20, 9) },
    { at: 4300, side: -74, build: () => microwaveTower(74) },
    { at: 4700, side: 120, build: () => radarDish(17) },
  ];
  for (const placement of placements) place(placement);

  // The mesas. A mesa of this size is a horizon silhouette and nothing else,
  // so each one stands a long way out — far enough that its talus skirt
  // cannot reach the lap where the circuit loops back on itself. Each is
  // still checked against the road before it is kept.
  const mesas: [number, number, number, number][] = [
    [560, -1980, 520, 150],
    [1340, 940, 430, 186],
    [1760, -2110, 380, 128],
    [2180, 1460, 560, 205],
    [2820, -2130, 640, 176],
    [3460, 700, 480, 142],
    [4120, 1520, 400, 120],
    [4620, 1350, 700, 168],
    [300, 900, 600, 118],
  ];
  mesas.forEach(([at, side, radius, height], i) => {
    place({
      at,
      side,
      lift: -height * 0.06,
      build: () => mesa(radius, height, 9, i + 2),
    });
  });

  // Long roads out of the place, so the desert has somewhere to go. They
  // begin well clear of the circuit and run outward, away from the middle of
  // the lap, because anything aimed across it meets the far side. Each one is
  // checked like everything else.
  for (const [at, side, reach] of [
    [820, 150, 1500],
    [3380, 150, 1400],
    [4560, 170, 1300],
  ] as const) {
    const f = frame(at / length);
    const a = f.p.clone().addScaledVector(f.right, side);
    const b = f.p.clone().addScaledVector(f.right, side < 0 ? -reach : reach);
    for (const p of [a, b]) p.y = ground.height(p.x, p.z);
    const road = serviceRoad(a, b, 9, ground.height);
    if (!assetIntersections(road, envelope).length) root.add(road);
  }
  return world;
}

/** The fence on the edge of the graded corridor.
 *
 * On this circuit the open ground beside the asphalt is a racing surface, so
 * the one thing a driver has to be able to see from a long way out is where
 * the ground stops being part of the course. The guardrail stands at half the
 * corridor width and is 1.8 m high, and this is that rail, drawn where it is:
 * short posts, a solar yellow top rail on the line that cannot be crossed,
 * and one oxide rail below it. Nothing fills the bays, so the desert and the
 * line a driver wants across it stay in view.
 *
 * The rail does not exist over the canyon, and neither does the fence. */
export function buildRimFence(root: THREE.Group) {
  const skip = (t: number) => inGap(t);
  for (const side of [-1, 1]) {
    root.add(fascia(side, RAIL - 0.3, RAIL, paint.green, 0.22, skip));
    root.add(fascia(side, RAIL * 0.4, RAIL * 0.4 + 0.2, paint.red, 0.22, skip));
  }
  for (let i = 0; i < samples.length; i += 3) {
    const f = samples[i];
    if (f.gap) continue;
    for (const side of [-1, 1]) {
      const post = box(0.26, RAIL, 0.36, paint.steel, "red");
      post.position
        .copy(f.p)
        .addScaledVector(f.right, side * (roadWidth(f.t) / 2 + 0.22))
        .addScaledVector(f.up, RAIL / 2);
      align(post, f);
      root.add(post);
    }
  }
}
