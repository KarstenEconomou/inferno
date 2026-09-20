import type { Input, Vehicle } from "../src/sim";
import { course, frame, length, track } from "../src/track";

/** Usable grip, as the square of the speed a corner of one metre of radius
 * allows, and the deceleration the driver is willing to ask for. */
const GRIP = 55;
const BRAKE = 22;

/** Length over which the turn of the road is measured. */
const SPAN = 22;

/** Signed radius of the road a short way ahead, measured in the plane of the
 * deck. A coil of the helix then reads as the corner it is, rather than as a
 * reversal of heading. */
function bendAt(t: number) {
  const a = frame(t),
    b = frame(t + SPAN / length);
  const turn = Math.atan2(
    a.forward.clone().cross(b.forward).dot(a.up),
    a.forward.dot(b.forward),
  );
  return {
    radius: Math.abs(turn) > 1e-4 ? SPAN / Math.abs(turn) : Infinity,
    turn,
  };
}

/** The road does not change while a lap is driven, so its corners are read
 * once into a table rather than measured again on every decision. Looking a
 * braking distance ahead means sampling the same corner many times a second,
 * and the driver is asked for a decision a hundred times a lap. */
const SAMPLE = 4;
const tables = new Map<unknown, Float64Array>();
function radiusTable() {
  let table = tables.get(course);
  if (!table) {
    const count = Math.ceil(length / SAMPLE);
    table = new Float64Array(count);
    for (let i = 0; i < count; i++)
      table[i] = Math.min(bendAt((i * SAMPLE) / length).radius, 1e4);
    tables.set(course, table);
  }
  return table;
}

/** The fastest this point can be taken and still leave room to slow for every
 * corner ahead. The horizon is the distance the car needs to stop hurrying,
 * so the same corner is glanced at from slow and committed to from fast. */
function pace(progress: number, speed: number) {
  const RADIUS = radiusTable();
  let limit = Infinity;
  const horizon = Math.max(60, speed ** 2 / (2 * BRAKE) + 40);
  const from = progress * length;
  for (let d = 10; d <= horizon; d += 10) {
    const i = Math.round((from + d) / SAMPLE) % RADIUS.length;
    const radius = RADIUS[(i + RADIUS.length) % RADIUS.length];
    limit = Math.min(limit, Math.sqrt(GRIP * radius + 2 * BRAKE * d));
  }
  return limit;
}

/** Repeatable driving decisions, not a route constraint or a production assist. */
export function drivingInput(
  v: Pick<
    Vehicle,
    "progress" | "position" | "heading" | "up" | "speed" | "grounded"
  > & {
    yawRate?: number;
    steering?: number;
    driftReadiness?: number;
    driftBlend?: number;
    slipAngle?: number;
  },
  options: {
    drift?: boolean;
    cautious?: boolean;
    analog?: boolean;
    /** Lateral offset of the line to follow, in metres, as a function of lap
     * fraction. It aims the driver; it never moves the car. */
    lateral?: (t: number) => number;
  } = {},
): Input {
  // Brake arrests takeoff pitch; steering cannot redirect the flight path.
  if (!v.grounded) return { throttle: 1, brake: true, steer: 0 };
  const ahead = bendAt(v.progress + 26 / length);
  // A course without a hairpin never asks this driver for a powered slide.
  const hairpin = (track.features ?? []).find((f) => f.kind === "hairpin") ?? {
    start: 2,
    end: 2,
  };
  const poweredCorner =
    options.drift && v.progress > hairpin.start && v.progress < hairpin.end;
  const lookAhead =
    v.progress +
    Math.max(
      12,
      Math.abs(v.speed) * (poweredCorner ? 0.65 : options.cautious ? 0.5 : 0.7),
    ) /
      length;
  const look = frame(lookAhead);
  const aim = look.p
    .clone()
    .addScaledVector(look.right, options.lateral?.(lookAhead) ?? 0);
  const dir = aim.sub(v.position).projectOnPlane(v.up).normalize();
  // Request the slide as the turn begins; the simulation builds load with
  // brake held. Release at the apex to carry the faster exit.
  const use =
    !!options.drift &&
    v.progress > hairpin.start &&
    v.progress < (hairpin.start + hairpin.end) / 2 &&
    ahead.radius < 170 &&
    (v.speed > 53 || (v.driftBlend ?? 0) > 0);
  // A powered slide carries speed through the apex: look farther ahead and
  // leave room on entry instead of relying on drift braking to tighten it.
  if (use) dir.applyAxisAngle(v.up, -Math.sign(ahead.turn) * 0.07);
  const angle =
    Math.atan2(v.heading.clone().cross(dir).dot(v.up), v.heading.dot(dir)) -
    (v.yawRate ?? 0) * (poweredCorner ? 0.1 : 0.12);
  const exiting =
    options.drift &&
    v.progress >= (hairpin.start + hairpin.end) / 2 &&
    v.progress < hairpin.end;
  let target = use ? 55 : exiting ? Infinity : pace(v.progress, v.speed);
  if (options.cautious) target = Math.min(target, 55);
  // A driver committing to a slide keeps working the wheel. Letting the
  // keyboard fall back to centre inside the deadband unloads the tires and
  // the slide never starts.
  const steer = options.analog
    ? Math.max(-1, Math.min(1, -angle * 5))
    : Math.abs(angle) < (use ? 0.004 : 0.06)
      ? 0
      : -Math.sign(angle);
  return {
    throttle: use || v.speed < target ? 1 : 0,
    brake: use || v.speed > target + 3,
    steer,
  };
}
