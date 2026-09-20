/** The vocabulary of the sound system: the tempo grid, the mix buses, the
 * list of semantic events and the recipe of each event. Game code emits an
 * event name from this list and never names a file or a frequency. */
export const BPM = 128;
export const GRID = {
  quarter: 60 / BPM,
  eighth: 60 / BPM / 2,
  sixteenth: 60 / BPM / 4,
  bar: (60 / BPM) * 4,
};
export const buses = [
  "music",
  "vehicle",
  "gameplay",
  "environment",
  "ui",
] as const;
export type Bus = (typeof buses)[number];
export type Mix = {
  master: number;
  music: number;
  vehicle: number;
  sfx: number;
  ambience: number;
};
export const defaultMix: Mix = {
  master: 0.65,
  music: 0.7,
  vehicle: 0.8,
  sfx: 0.8,
  ambience: 0.45,
};
export function parseMix(value: unknown): Mix {
  const result = { ...defaultMix };
  if (!value || typeof value !== "object") return result;
  for (const k of Object.keys(result) as (keyof Mix)[]) {
    const v = (value as Mix)[k];
    if (Number.isFinite(v)) result[k] = Math.max(0, Math.min(1, v));
  }
  return result;
}
export const events = [
  "race.start",
  "race.restart",
  "race.respawn",
  "race.finish",
  "race.pb",
  "race.invalid",
  "race.count.3",
  "race.count.2",
  "race.count.1",
  "checkpoint.hit",
  "checkpoint.ahead",
  "checkpoint.behind",
  "vehicle.boost.enter",
  "vehicle.boost.loop",
  "vehicle.boost.exit",
  "vehicle.jump",
  "vehicle.land",
  "vehicle.scrape",
  "vehicle.impact",
  "ui.move",
  "ui.confirm",
  "ui.back",
  "ui.denied",
  "ui.panel",
  "environment.pulse",
] as const;
export type AudioEvent = (typeof events)[number];
export type Recipe = {
  bus: Bus;
  duration: number;
  gain: number;
  priority: number;
  cooldown: number;
  variants: number;
};
const recipe = (
  bus: Bus,
  duration: number,
  gain: number,
  priority: number,
  cooldown = 0,
  variants = 1,
): Recipe => ({ bus, duration, gain, priority, cooldown, variants });
export const recipes: Record<AudioEvent, Recipe> = {
  "race.start": recipe("gameplay", 0.32, 0.38, 8),
  "race.restart": recipe("gameplay", 0.1, 0.23, 10),
  "race.respawn": recipe("gameplay", 0.2, 0.26, 10),
  "race.finish": recipe("gameplay", 0.35, 0.36, 8),
  "race.pb": recipe("gameplay", GRID.bar, 0.42, 9),
  "race.invalid": recipe("gameplay", 0.24, 0.24, 8, 0.25),
  "race.count.3": recipe("gameplay", 0.12, 0.24, 8),
  "race.count.2": recipe("gameplay", 0.14, 0.27, 8),
  "race.count.1": recipe("gameplay", 0.18, 0.3, 8),
  "checkpoint.hit": recipe("gameplay", 0.06, 0.25, 7, 0.05, 3),
  "checkpoint.ahead": recipe("gameplay", GRID.sixteenth + 0.07, 0.22, 7, 0.05),
  "checkpoint.behind": recipe("gameplay", 0.12, 0.23, 7, 0.05),
  "vehicle.boost.enter": recipe("gameplay", 1.2, 0.4, 8, 0.12),
  "vehicle.boost.loop": recipe("vehicle", 1.2, 0.08, 3, 0.18),
  "vehicle.boost.exit": recipe("vehicle", GRID.eighth, 0.13, 4, 0.12),
  "vehicle.jump": recipe("vehicle", 0.16, 0.23, 5, 0.18, 3),
  "vehicle.land": recipe("gameplay", 0.24, 0.4, 8, 0.14, 3),
  "vehicle.scrape": recipe("vehicle", 0.075, 0.09, 2, 0.12, 3),
  "vehicle.impact": recipe("gameplay", 0.28, 0.38, 8, 0.1, 3),
  "ui.move": recipe("ui", 0.032, 0.18, 4, 0.022, 4),
  "ui.confirm": recipe("ui", 0.14, 0.23, 5, 0.055, 3),
  "ui.back": recipe("ui", 0.1, 0.19, 5, 0.055, 3),
  "ui.denied": recipe("ui", 0.045, 0.17, 5, 0.1),
  "ui.panel": recipe("ui", 0.045, 0.16, 4, 0.07),
  "environment.pulse": recipe("environment", 0.2, 0.12, 1, 0.5, 3),
};
export class Transport {
  origin: number;
  constructor(origin = 0) {
    this.origin = origin;
  }
  phase(time: number) {
    const beats = Math.max(0, (time - this.origin) / GRID.quarter);
    return { beats, bar: Math.floor(beats / 4), phase: (beats % 4) / 4 };
  }
  next(time: number, division = GRID.eighth) {
    return (
      this.origin + (Math.floor((time - this.origin) / division) + 1) * division
    );
  }
}
export type Telemetry = {
  speed: number;
  forward: number;
  throttle: number;
  brake: boolean;
  poweredDrift: boolean;
  slip: number;
  grounded: boolean;
  boost: boolean;
  scrape: boolean;
  active: boolean;
  paused: boolean;
  finished: boolean;
  position: number[];
  heading: number[];
  up: number[];
};
export const idleTelemetry: Telemetry = {
  speed: 0,
  forward: 0,
  throttle: 0,
  brake: false,
  poweredDrift: false,
  slip: 0,
  grounded: true,
  boost: false,
  scrape: false,
  active: false,
  paused: false,
  finished: false,
  position: [0, 0, 0],
  heading: [0, 0, -1],
  up: [0, 1, 0],
};
export function vehicleParameters(t: Telemetry) {
  const slip = Math.max(0, Math.min(1, t.slip));
  const poweredDrift = t.poweredDrift && t.grounded && t.throttle > 0;
  const braking = (t.brake || t.throttle < 0) && !poweredDrift;
  const speed = Math.max(0, Math.min(100, Math.abs(t.speed))),
    throttle = braking ? 0 : Math.max(0, Math.min(1, t.throttle));
  // A synthetic ratio for the sound only. The vehicle has no gearbox.
  const ratio = 1 + Math.floor(Math.min(5, Math.abs(t.forward) / 12));
  const rpm =
    900 +
    (Math.abs(t.forward) * 65) / Math.sqrt(ratio) +
    (t.grounded ? 0 : throttle * 1500);
  const load = t.grounded
    ? throttle * (1 - slip * (poweredDrift ? 0.15 : 0.55))
    : 0.08 * throttle;
  const coupling = t.grounded ? 1 : 0.24;
  return {
    speed,
    rpm,
    load,
    throttle,
    coupling,
    slip,
    body: (0.026 + load * 0.028) * coupling,
    harmonic: 0.006 + load * 0.025,
    air: Math.pow(speed / 85, 1.65) * 0.034 * (t.grounded ? 1 : 1.35),
    tire: t.grounded
      ? Math.pow(Math.max(0, slip - 0.06), 0.8) * Math.min(1, speed / 22) * 0.11
      : 0,
    // The reverse control also brakes forward motion. Neither stationary nor
    // airborne brake input should make tire friction.
    brake:
      t.grounded && braking
        ? Math.min(1, Math.max(0, t.forward) / 22) * 0.14
        : 0,
    scrape: t.scrape && t.grounded ? Math.min(1, speed / 25) * 0.042 : 0,
    environment: Math.max(0.12, 1 - speed / 75) * (t.boost ? 0.55 : 1),
  };
}
