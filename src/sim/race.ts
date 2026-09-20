import { Matrix4, Quaternion, Vector3 } from "three";
import { frame, roadWidth, track, wrap } from "../track";
import { Vehicle } from "./vehicle";

export type Pose = {
  t: number;
  p: number[];
  h: number[];
  u: number[];
  cut?: boolean;
  steeringAngle?: number;
};
export function interpolatePose(a: Pose, b: Pose, alpha: number): Pose {
  // A respawn is a cut. The ghost must not drive through the scenery between
  // the two samples.
  const mix = b.cut
    ? b.t === a.t || alpha >= 1
      ? 1
      : 0
    : Math.max(0, Math.min(1, alpha));
  if (mix === 0) return a;
  if (mix === 1) return b;
  const vector = (x: number[], y: number[], normalize = false) => {
    const v = new Vector3().fromArray(x).lerp(new Vector3().fromArray(y), mix);
    return (normalize ? v.normalize() : v).toArray();
  };
  const orientation = (pose: Pose) => {
    const h = new Vector3().fromArray(pose.h).normalize();
    const right = h.clone().cross(new Vector3().fromArray(pose.u)).normalize();
    const up = right.clone().cross(h).normalize();
    return new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(right, up, h.negate()),
    );
  };
  const rotation = orientation(a).slerp(orientation(b), mix);
  return {
    t: a.t + (b.t - a.t) * mix,
    p: vector(a.p, b.p),
    h: new Vector3(0, 0, -1).applyQuaternion(rotation).toArray(),
    u: new Vector3(0, 1, 0).applyQuaternion(rotation).toArray(),
    steeringAngle:
      (a.steeringAngle ?? 0) +
      ((b.steeringAngle ?? 0) - (a.steeringAngle ?? 0)) * mix,
  };
}
export type RecordRun = {
  version: string;
  time: number;
  splits: number[];
  poses: Pose[];
};
export class Race {
  time = 0;
  nextCheckpoint = 0;
  splits: number[] = [];
  poses: Pose[] = [];
  finished = false;
  lastProgress = 0;
  sampleClock = 0;
  constructor(car = new Vehicle()) {
    this.lastProgress = car.progress;
    this.record(car);
  }
  private record(car: Vehicle, cut = false) {
    const pose: Pose = {
      t: this.time,
      p: car.position.toArray(),
      h: car.heading.toArray(),
      u: car.up.toArray(),
      steeringAngle: car.steeringAngle,
      ...(cut ? { cut: true } : {}),
    };
    const last = this.poses.at(-1);
    if (!cut && last?.t === this.time) this.poses[this.poses.length - 1] = pose;
    else this.poses.push(pose);
  }
  update(car: Vehicle, dt: number) {
    if (this.finished) return;
    this.time += dt;
    this.sampleClock += dt;
    const prev = this.lastProgress,
      now = car.progress,
      delta = wrap(now - prev + 0.5) - 0.5;
    const crossed = (gate: number) => {
      if (!(delta > 0 && delta < 0.02 && wrap(gate - prev) <= delta))
        return false;
      const f = frame(gate),
        offset = car.position.clone().sub(f.p);
      // A gate is a forward crossing over its road span, including jumps
      // above the gantry. Passing beside or underneath the deck is a miss.
      return (
        Math.abs(offset.dot(f.right)) < roadWidth(gate) / 2 &&
        offset.dot(f.up) >= 0
      );
    };
    if (
      this.nextCheckpoint < track.checkpoints.length &&
      crossed(track.checkpoints[this.nextCheckpoint])
    ) {
      this.splits.push(this.time);
      this.nextCheckpoint++;
    }
    if (this.nextCheckpoint === track.checkpoints.length && crossed(0))
      this.finished = true;
    this.lastProgress = now;
    if (this.sampleClock >= 1 / 30 || this.finished) {
      this.sampleClock %= 1 / 30;
      this.record(car);
    }
  }
  respawn(car: Vehicle) {
    this.record(car);
    const t = this.nextCheckpoint
      ? track.checkpoints[this.nextCheckpoint - 1] + 0.002
      : 0;
    car.reset(t);
    this.lastProgress = t;
    this.record(car, true);
  }
}
export function parseRecord(
  raw: string | null,
  version: string,
): RecordRun | null {
  try {
    const r = JSON.parse(raw || "null");
    return r &&
      r.version === version &&
      Number.isFinite(r.time) &&
      r.time > 0 &&
      Array.isArray(r.splits) &&
      r.splits.length === track.checkpoints.length &&
      r.splits.every(
        (s: number, i: number) =>
          Number.isFinite(s) &&
          s > 0 &&
          s <= r.time &&
          (i === 0 || s > r.splits[i - 1]),
      ) &&
      Array.isArray(r.poses) &&
      r.poses.length > 1 &&
      r.poses.every(
        (p: Pose, i: number) =>
          Number.isFinite(p.t) &&
          p.t >= 0 &&
          p.t <= r.time &&
          (p.cut === undefined || typeof p.cut === "boolean") &&
          (p.steeringAngle === undefined || Number.isFinite(p.steeringAngle)) &&
          (i === 0 ||
            p.t > r.poses[i - 1].t ||
            (p.cut === true && p.t === r.poses[i - 1].t)) &&
          [p.p, p.h, p.u].every(
            (a) =>
              Array.isArray(a) && a.length === 3 && a.every(Number.isFinite),
          ),
      )
      ? r
      : null;
  } catch {
    return null;
  }
}
