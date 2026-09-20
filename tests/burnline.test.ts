import { describe, expect, it } from "vitest";
import { BufferGeometry, Group, MeshBasicMaterial, Vector3 } from "three";
import { Race, STEP, Vehicle } from "../src/sim";
import {
  course,
  frame,
  inGap,
  lane,
  length,
  nearest,
  paved,
  point,
  roadWidth,
  selectCourse,
  surfaceDrag,
  surfaceGrip,
  track,
} from "../src/track";
import { assetIntersections, drivingEnvelope } from "../src/track/clearance";
import { buildTrackArchitecture } from "../src/render/environment";
import { buildDesert, buildGround, buildRimFence } from "../src/render/desert";
import { drivingInput } from "./driver";

// Burnline is not the course the rest of the suite drives. Selecting it here
// rebuilds the collision strips and the pad frames for this file only.
selectCourse("burnline");

/** Distances around the lap of the four authored open-ground lines, as
 * fractions of the compiled length. */
const cuts = {
  lake: [0.03, 0.21],
  dirt: [0.355, 0.44],
  embankment: [0.775, 0.84],
  rim: [0.84, 0.9],
} as const;

/** Length of a line held at a lateral offset through a stretch of road. */
function line(from: number, to: number, lateral: (t: number) => number) {
  const at = (d: number) => {
    const t = d / length;
    const f = frame(t);
    return f.p.clone().addScaledVector(f.right, lateral(t));
  };
  let total = 0,
    previous = at(from);
  for (let d = from + 2; d <= to; d += 2) {
    const p = at(d);
    total += p.distanceTo(previous);
    previous = p;
  }
  return total;
}
const paint = (t: number) => lane(t).offset;
/** The open-ground line through one cut: the far side of the corridor from
 * the paint, held for the whole stretch. */
const insideOf = (from: number, to: number) => {
  const side = -Math.sign(lane((from + to) / 2).offset || 1);
  return (t: number) => side * (roadWidth(t) / 2 - 4);
};

describe("Burnline: a graded corridor with a road painted through it", () => {
  it("is one closed desert lap with five sectors and a canyon", () => {
    expect(track.id).toBe("burnline-1");
    expect(track.scenery).toBe("desert");
    expect(length).toBeGreaterThan(4800);
    expect(length).toBeLessThan(5200);
    expect(track.checkpoints).toHaveLength(4);
    expect(track.sectors).toHaveLength(5);
    expect(track.gaps).toHaveLength(1);
    expect(track.boosts.length).toBeGreaterThanOrEqual(6);
    // Every gate is also a respawn, so each one stands on straight road of a
    // width a car can be put back on.
    for (const t of [0, ...track.checkpoints]) {
      const ahead = frame(t + 30 / length).forward;
      expect(frame(t).forward.dot(ahead)).toBeGreaterThan(0.995);
      expect(roadWidth(t)).toBeLessThan(28);
      expect(inGap(t)).toBe(false);
    }
    // The timing platform is level, whatever the descent into it was doing.
    for (const d of [-20, 0, 20])
      expect(Math.abs(point(d / length).y - point(0).y)).toBeLessThan(0.05);
  });

  it("paints a lane that never leaves the corridor it is painted on", () => {
    let narrowest = Infinity,
      widest = 0,
      room = Infinity;
    for (let d = 0; d < length; d += 1) {
      const t = d / length;
      const { offset, halfWidth } = lane(t);
      const width = roadWidth(t);
      narrowest = Math.min(narrowest, width);
      widest = Math.max(widest, width);
      room = Math.min(room, width / 2 - (Math.abs(offset) + halfWidth));
    }
    expect(room).toBeGreaterThan(0);
    expect(narrowest).toBeCloseTo(track.width, 5);
    expect(widest).toBeGreaterThan(44);
  });

  it("gives the paint full grip and the open ground less, deterministically", () => {
    const t = (cuts.dirt[0] + cuts.dirt[1]) / 2;
    const { offset, halfWidth } = lane(t);
    expect(paved(t, offset)).toBe(1);
    expect(surfaceGrip(t, offset)).toBe(1);
    expect(surfaceDrag(t, offset)).toBe(0);
    const open = offset - halfWidth - 6;
    expect(paved(t, open)).toBe(0);
    expect(surfaceGrip(t, open)).toBeCloseTo(track.lane!.grip, 6);
    expect(surfaceDrag(t, open)).toBeCloseTo(track.lane!.drag, 6);
    // The edge is a blend, not a step, and it repeats exactly.
    const edge = offset - halfWidth + 0.4;
    expect(surfaceGrip(t, edge)).toBeGreaterThan(track.lane!.grip);
    expect(surfaceGrip(t, edge)).toBeLessThan(1);
    expect(surfaceGrip(t, edge)).toBe(surfaceGrip(t, edge));
  });

  it("makes every authored cut shorter than the road it leaves", () => {
    for (const [name, [from, to]] of Object.entries(cuts)) {
      const a = from * length,
        b = to * length;
      const saved = line(a, b, paint) - line(a, b, insideOf(from, to));
      expect(`${name} ${saved > 12}`).toBe(`${name} true`);
    }
  });

  it("puts every boost pad on the paint", () => {
    for (const t of track.boosts) {
      const { offset, halfWidth } = lane(t);
      expect(paved(t, offset)).toBe(1);
      // A pad is wide; the paint has to hold all of it.
      expect(halfWidth).toBeGreaterThan(4);
    }
  });

  it("clears the canyon from any speed, further the faster it arrives", () => {
    const lip = track.gaps[0][0] * length;
    const flight = (speed: number) => {
      const car = new Vehicle();
      const start = track.gaps[0][0] - 110 / length;
      car.reset(start);
      car.velocity.copy(car.heading).multiplyScalar(speed);
      let launched = -1;
      for (let i = 0; i < 120 * 12; i++) {
        car.step({ throttle: 1, steer: 0, brake: false });
        const d = car.progress * length;
        if (launched < 0) {
          if (!car.grounded && d > lip - 30) launched = d;
          continue;
        }
        if (car.grounded) return d - lip;
      }
      return NaN;
    };
    const ranges = [45, 60, 75, 90].map(flight);
    for (const range of ranges) {
      expect(range).toBeGreaterThan(
        (track.gaps[0][1] - track.gaps[0][0]) * length,
      );
      expect(range).toBeLessThan(260);
    }
    expect(ranges).toEqual([...ranges].sort((a, b) => a - b));
    // The same entry gives the same landing, to the last place a float holds.
    expect(flight(70)).toBe(flight(70));
  });

  it("drives a full lap on the paint without a respawn", () => {
    const car = new Vehicle();
    const race = new Race(car);
    let respawns = 0;
    for (let i = 0; i < 120 * 180 && !race.finished; i++) {
      car.step(
        drivingInput(car, { lateral: (t) => lane(course.wrap(t)).offset }),
      );
      race.update(car, STEP);
      if (car.needsRespawn) {
        race.respawn(car);
        respawns++;
      }
    }
    expect(race.finished).toBe(true);
    expect(respawns).toBe(0);
    expect(race.splits).toHaveLength(track.checkpoints.length);
    expect(race.time).toBeGreaterThan(45);
    expect(race.time).toBeLessThan(110);
  });

  it("keeps the desert out of the road", () => {
    const architecture = buildTrackArchitecture(() => new MeshBasicMaterial());
    const envelope = drivingEnvelope(course);
    const structures = buildDesert().getObjectByName("desert-structures")!;
    expect(assetIntersections(structures, envelope)).toEqual([]);
    // The graded bench under the deck never comes up through it, at any
    // lateral offset. The corridor banks, and a corridor of 48 m at 0.3 rad
    // drops nearly 8 m from one edge to the other, so a bench measured from
    // the centreline alone would stand through the low edge of the road.
    const ground = buildGround();
    for (let i = 0; i < course.samples.length; i += 5) {
      const sample = course.samples[i];
      if (sample.gap) continue;
      const half = roadWidth(sample.t) / 2;
      for (let side = -1; side <= 1.0001; side += 0.25) {
        const p = sample.p.clone().addScaledVector(sample.right, side * half);
        expect(ground.height(p.x, p.z)).toBeLessThan(p.y - 1.5);
      }
    }
    // The architecture itself still describes a deck the car can sit on.
    expect(architecture.children.length).toBeGreaterThan(10);
  });

  it("keeps every landmark the proving ground was given", () => {
    // A piece that reaches the driving envelope is dropped where it stands,
    // so a count short of the authored one is a landmark that is not there.
    const structures = buildDesert().getObjectByName("desert-structures")!;
    const kinds: Record<string, number> = {};
    for (const child of structures.children)
      kinds[child.name] = (kinds[child.name] ?? 0) + 1;
    expect(kinds).toEqual({
      pylon: 12,
      "radar-dish": 3,
      "microwave-tower": 4,
      "blast-wall": 7,
      portal: 3,
      bunker: 7,
      "antenna-array": 1,
      mesa: 9,
      "service-road": 3,
    });
  });

  it("opens the canyon under the jump and closes it before the lakebed", () => {
    const ground = buildGround();
    const [takeoff, landing] = track.gaps[0];
    // Over the gap the ground is the floor of the trench, not a bench under a
    // road that is not there.
    for (const t of [
      takeoff + 0.2 / length,
      (takeoff + landing) / 2,
      landing,
    ]) {
      const f = frame(t);
      expect(ground.height(f.p.x, f.p.z)).toBeLessThan(f.p.y - 100);
    }
    // The lip itself still stands on solid ground, 20 m back from the edge.
    for (const t of [takeoff - 20 / length, landing + 20 / length]) {
      const f = frame(t);
      expect(ground.height(f.p.x, f.p.z)).toBeGreaterThan(f.p.y - 12);
    }
    // The trench closes well short of every other part of the lap, so no
    // other sector runs along a chasm it was not given.
    for (let i = 0; i < course.samples.length; i += 3) {
      const sample = course.samples[i];
      if (sample.gap) continue;
      if (sample.t > takeoff - 60 / length && sample.t < landing + 60 / length)
        continue;
      expect(ground.height(sample.p.x, sample.p.z)).toBeGreaterThan(
        sample.p.y - 12,
      );
    }
  });

  it("draws the ground in contours and fences the edge of the corridor", () => {
    const ground = buildGround();
    const lines = ground.root.children.filter(
      (child) => (child as { isLineSegments?: boolean }).isLineSegments,
    );
    // The desert is drawn as well as shaded: indigo contour lines are what
    // make a hill read as a hill and a wall read as a wall.
    expect(lines).toHaveLength(1);
    const drawn = (lines[0] as unknown as { geometry: BufferGeometry })
      .geometry;
    expect(drawn.getAttribute("position").count / 2).toBeGreaterThan(2000);
    // The fence stands on the line the guardrail is on, and stops at the gap.
    const fence = new Group();
    buildRimFence(fence);
    const posts = fence.children.filter((child) => !child.userData.trackRibbon);
    expect(posts.length).toBeGreaterThan(400);
    for (const post of posts) {
      const found = nearest(post.position);
      expect(Math.abs(found.lateral)).toBeGreaterThan(roadWidth(found.t) / 2);
      expect(Math.abs(found.lateral)).toBeLessThan(roadWidth(found.t) / 2 + 1);
      expect(inGap(found.t)).toBe(false);
    }
  });

  it("never brings two parts of the corridor within reach of each other", () => {
    // The lap has no crossing and no place where a car could leave one part
    // of the course and arrive on another, so no cut can skip a sector.
    const samples = course.samples;
    let closest = Infinity;
    for (let i = 0; i < samples.length; i++)
      for (let j = i + 1; j < samples.length; j++) {
        const arc =
          (Math.min(j - i, samples.length - (j - i)) * length) / samples.length;
        if (arc < 140) continue;
        const a = samples[i],
          b = samples[j];
        const room =
          a.p.distanceTo(b.p) -
          (roadWidth(a.t) + roadWidth(b.t)) / 2 -
          2 * 1.29;
        closest = Math.min(closest, room);
      }
    expect(closest).toBeGreaterThan(30);
  });

  it("finds the road again from any point above the corridor", () => {
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      if (inGap(t)) continue;
      const f = frame(t);
      const p = f.p
        .clone()
        .addScaledVector(f.right, roadWidth(t) / 2 - 1)
        .addScaledVector(f.up, 1.2);
      const found = nearest(p, t);
      expect(Math.abs(found.lateral)).toBeLessThan(roadWidth(t) / 2 + 1);
      expect(found.p.distanceTo(new Vector3(f.p.x, f.p.y, f.p.z))).toBeLessThan(
        8,
      );
    }
  });
});
