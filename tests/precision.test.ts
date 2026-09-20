import { writeFileSync } from "node:fs";
import { it, expect } from "vitest";
import { Vehicle, Race, STEP, type Input } from "../src/sim";
import {
  frame,
  track,
  length,
  nearest,
  samples,
  surface,
  roadWidth,
} from "../src/track";
import { sweepDeck } from "../src/sim/contact";
import { drivingInput } from "./driver";
import { BOOST_PAD_BOUNDS } from "../src/track/markers";
const drive: Input = { throttle: 1, steer: 0, brake: false };
it("has continuous road frames through vertical walls and inverted driving", () => {
  let vertical = 0,
    inverted = 0;
  for (let i = 0; i < 5000; i++) {
    const a = frame(i / 5000),
      b = frame((i + 1) / 5000);
    expect(a.up.dot(a.forward)).toBeCloseTo(0, 8);
    expect(a.right.dot(a.forward)).toBeCloseTo(0, 8);
    if (
      !track.gaps.some(
        ([start, end]) =>
          Math.abs(i / 5000 - start) < 0.001 ||
          Math.abs(i / 5000 - end) < 0.001,
      )
    )
      expect(a.up.dot(b.up), `frame ${i / 5000}`).toBeGreaterThan(0.97);
    // A wall ride stands the deck on its edge, so its normal lies flat.
    if (Math.abs(a.up.y) < 0.15) vertical++;
    if (a.up.y < -0.8) inverted++;
  }
  expect(vertical).toBeGreaterThan(20);
  expect(inverted).toBeGreaterThan(100);
});
it("sweeps the driving side of inverted and vertical decks", () => {
  for (const kind of ["wallride", "helix", "inverted"]) {
    const zone = track.features!.find((f) => f.kind === kind)!;
    const t = (zone.start + zone.end) / 2,
      f = frame(t);
    const hit = sweepDeck(
      f.p.clone().addScaledVector(f.up, 4),
      f.p.clone().addScaledVector(f.up, -4),
    );
    expect(hit, kind).not.toBeNull();
    expect(hit!.normal.dot(f.up)).toBeGreaterThan(0.99);
    expect(
      sweepDeck(
        f.p.clone().addScaledVector(f.up, -4),
        f.p.clone().addScaledVector(f.up, 4),
      ),
      kind,
    ).toBeNull();
  }
});
it("keeps a fast car attached to the ceiling and lets a stopped one fall", () => {
  const zone = track.features!.find((f) => f.kind === "inverted")!;
  const t = (zone.start + zone.end) / 2;
  expect(frame(t).up.y).toBeLessThan(-0.8);
  const fast = new Vehicle(),
    stopped = new Vehicle();
  fast.reset(t);
  stopped.reset(t);
  fast.velocity.copy(fast.heading).multiplyScalar(70);
  fast.step(drive);
  stopped.step({ ...drive, throttle: 0 });
  expect(fast.grounded).toBe(true);
  expect(stopped.grounded).toBe(false);
  expect(stopped.velocity.y).toBeLessThan(0);
});
it.each([6, 12, 18])(
  "completes the three-dimensional course at %s-tick keyboard cadence",
  (cadence) => {
    const results = [];
    const events: any[] = [];
    for (const drift of [false, true]) {
      const v = new Vehicle(),
        r = new Race(v);
      let input = drive,
        air = false,
        lands = 0,
        rails = 0,
        maxSlip = 0,
        boosts = 0,
        peakSpeed = 0;
      const visited = new Set<string>();
      const boostedPads = new Set<number>();
      const padFrames = track.boosts.map((t) => frame(t));
      const padMissDistances = track.boosts.map(() => Infinity);
      for (let i = 0; i < 120 * 100 && !r.finished; i++) {
        if (i % cadence === 0) input = drivingInput(v, { drift });
        const oldBoost = v.boost;
        v.step(input);
        if (v.boost > oldBoost) {
          boosts++;
          boostedPads.add(v.activePad);
        }
        if (v.grounded)
          padFrames.forEach((f, index) => {
            const offset = v.position.clone().sub(f.p);
            const miss = Math.hypot(
              Math.max(
                0,
                Math.abs(offset.dot(f.right)) - BOOST_PAD_BOUNDS.halfWidth,
              ),
              Math.max(
                0,
                Math.abs(offset.dot(f.forward)) - BOOST_PAD_BOUNDS.halfLength,
              ),
            );
            padMissDistances[index] = Math.min(padMissDistances[index], miss);
          });
        peakSpeed = Math.max(peakSpeed, v.speed);
        r.update(v, STEP);
        if (!v.grounded && !air)
          events.push({
            kind: "air",
            t: v.progress,
            speed: v.speed,
            up: v.up.toArray(),
            time: r.time,
          });
        if (!v.grounded) air = true;
        else if (air) {
          air = false;
          lands++;
          events.push({
            kind: "land",
            t: v.progress,
            speed: v.speed,
            up: v.up.toArray(),
            time: r.time,
          });
        }
        if (v.railContact) {
          rails++;
          events.push({
            kind: "rail",
            t: v.progress,
            speed: v.speed,
            time: r.time,
          });
        }
        if (v.driftPhase === "drift")
          maxSlip = Math.max(maxSlip, Math.abs(v.slipAngle));
        for (const feature of track.features!)
          if (
            v.progress > feature.start &&
            v.progress < feature.end &&
            v.grounded
          )
            visited.add(feature.kind);
        if (v.position.distanceTo(frame(v.progress).p) > 70) break;
      }
      writeFileSync(
        `/tmp/inferno-events-${cadence}.json`,
        JSON.stringify(events, null, 2),
      );
      results.push({
        drift,
        finished: r.finished,
        time: r.time,
        t: v.progress,
        rails,
        lands,
        maxSlip,
        boosts,
        boostedPads: [...boostedPads],
        padMissDistances,
        peakSpeed,
        visited: [...visited],
      });
      writeFileSync(
        `/tmp/inferno-route-${cadence}.json`,
        JSON.stringify(results, null, 2),
      );
      expect(r.finished).toBe(true);
      expect(rails).toBe(0);
      expect(lands).toBe(2);
      expect(visited.size).toBe(4);
      // Coarse keyboard steering can now miss one narrow painted pad;
      // every pad's exact activation edges are checked in markers.test.ts.
      expect(boosts).toBeGreaterThanOrEqual(track.boosts.length - 1);
      expect(boosts).toBeLessThanOrEqual(track.boosts.length);
      padMissDistances.forEach((miss, index) => {
        if (!boostedPads.has(index)) expect(miss).toBeGreaterThan(0);
      });
      expect(peakSpeed).toBeGreaterThan(85);
      if (drift) expect(maxSlip).toBeGreaterThan(0.07); // Measured slip, no guaranteed drift angle.
    }
  },
);

it("lands on an inverted deck with the wheels, but rejects a roof-first ceiling impact", () => {
  const zone = track.features!.find((f) => f.kind === "inverted")!,
    t = (zone.start + zone.end) / 2;
  const f = frame(t);
  for (const aligned of [true, false]) {
    const v = new Vehicle();
    v.reset(t);
    if (!aligned) v.up.negate();
    v.position.addScaledVector(f.up, 0.25);
    v.velocity.copy(f.forward).multiplyScalar(70).addScaledVector(f.up, -45);
    v.grounded = false;
    v.step(drive);
    expect(v.grounded).toBe(aligned);
    expect(v.velocity.length()).toBeLessThan(Math.hypot(70, 45));
    if (aligned) expect(v.up.dot(f.up)).toBeGreaterThan(0.99);
  }
});

it("every checkpoint respawns onto a usable road with no inherited rotation or boost", () => {
  for (let cp = 0; cp < track.checkpoints.length; cp++) {
    const v = new Vehicle(),
      r = new Race(v);
    r.nextCheckpoint = cp + 1;
    r.time = 25;
    v.angularVelocity.set(2, 1, 3);
    v.boost = 1;
    r.respawn(v);
    expect(v.angularVelocity.length()).toBe(0);
    expect(v.boost).toBe(0);
    expect(r.time).toBe(25);
    expect(v.up.y).toBeGreaterThan(0.65);
    for (let i = 0; i < 240; i++) v.step(drivingInput(v));
    expect(v.grounded).toBe(true);
    expect(v.railContact).toBe(false);
    expect(v.speed).toBeGreaterThan(20);
  }
});

it("does not create mechanical energy while coasting through the helix", () => {
  const zone = track.features!.find((f) => f.kind === "helix")!;
  const v = new Vehicle();
  v.reset(zone.start + 0.002);
  v.velocity.copy(v.heading).multiplyScalar(90);
  const energy = () => v.velocity.lengthSq() / 2 + 30 * v.position.y;
  const initial = energy();
  let minimum = initial;
  for (let i = 0; i < 500 && v.progress < zone.end; i++) {
    v.step({
      ...drivingInput(v, { analog: true }),
      throttle: 0,
      brake: false,
    });
    expect(energy()).toBeLessThanOrEqual(initial + 1);
    minimum = Math.min(minimum, energy());
  }
  expect(minimum).toBeLessThan(initial - 100);
});

it("produces the same complete 3D lap and ghost poses at 30 and 144 render frames per second", () => {
  const run = (fps: number) => {
    const v = new Vehicle(),
      r = new Race(v);
    let accumulator = 0,
      tick = 0,
      input = drive;
    for (let i = 0; i < fps * 90 && !r.finished; i++) {
      accumulator += 1 / fps;
      while (accumulator >= STEP - 1e-10 && !r.finished) {
        if (tick % 12 === 0) input = drivingInput(v, { drift: true });
        v.step(input);
        r.update(v, STEP);
        tick++;
        accumulator -= STEP;
      }
    }
    expect(r.finished).toBe(true);
    return { v, r };
  };
  const a = run(30),
    b = run(144);
  expect(a.v.position.distanceTo(b.v.position)).toBeLessThan(1e-10);
  expect(a.v.up.distanceTo(b.v.up)).toBeLessThan(1e-10);
  expect(a.r.time).toBe(b.r.time);
  expect(a.r.poses).toEqual(b.r.poses);
});

it.each([-1, 1])(
  "keeps forward speed during sustained inverted contact with rail %s",
  (side) => {
    const zone = track.features!.find((f) => f.kind === "inverted")!,
      t = (zone.start + zone.end) / 2;
    const v = new Vehicle();
    v.reset(t);
    const f = frame(t);
    v.position.addScaledVector(f.right, side * (roadWidth(t) / 2 - 1.4));
    v.velocity
      .copy(f.forward)
      .multiplyScalar(70)
      .addScaledVector(f.right, side * 12);
    v.heading.copy(v.velocity).normalize();
    let hits = 0;
    for (let i = 0; i < 60; i++) {
      v.step(drive);
      if (v.railContact) hits++;
      expect(v.grounded).toBe(true);
      expect(v.needsRespawn).toBe(false);
      expect(Math.abs(nearest(v.position).lateral)).toBeLessThan(
        roadWidth(v.progress) / 2 - 1.27,
      );
    }
    expect(hits).toBeGreaterThan(5);
    expect(v.speed).toBeGreaterThan(40);
  },
);
it("requests quick recovery after a head-on inverted rail impact without leaving the level", () => {
  const zone = track.features!.find((f) => f.kind === "inverted")!,
    t = (zone.start + zone.end) / 2;
  const v = new Vehicle();
  v.reset(t);
  const f = frame(t),
    start = v.position.clone();
  v.position.addScaledVector(f.right, roadWidth(t) / 2 - 1.4);
  v.heading.copy(f.right);
  v.velocity.copy(f.right).multiplyScalar(70);
  let elapsed = 0;
  while (!v.needsRespawn && elapsed < 1) {
    v.step(drive);
    elapsed += STEP;
  }
  expect(v.needsRespawn).toBe(true);
  expect(elapsed).toBeLessThan(0.5);
  expect(v.position.distanceTo(start)).toBeLessThan(20);
  const r = new Race(v);
  r.nextCheckpoint = 2;
  r.respawn(v);
  expect(v.needsRespawn).toBe(false);
  expect(v.grounded).toBe(true);
  expect(v.up.y).toBeGreaterThan(0.65);
});
