import type { vehicleParameters } from "./model.ts";
type Vehicle = ReturnType<typeof vehicleParameters>;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => {
  const x = clamp(n);
  return x * x * (3 - 2 * x);
};

/** Drivetrain layer levels for one frame. Nothing here follows a clock, so a
 * constant input always gives a constant result. */
export function drivetrainTargets(p: Vehicle, attack = 0, contact = false) {
  const register = ease(p.speed / 80);
  const high = ease((register - 0.48) / 0.52);
  const coupling = p.coupling;
  // There is no model of wheelspin or of a clutch. A car held by a wall thus
  // stays under load at a low road speed.
  const constraint = contact ? 1 - ease(p.speed / 4) : 0;
  const urgency = 0.12 + 0.88 * p.throttle;
  const weight = 0.25 + 0.75 * p.load;
  const energy =
    (0.004 + urgency * weight * 0.037) * (coupling === 1 ? 1 : 0.28);
  return {
    register,
    body: (0.0035 + p.load * 0.027) * (1 - register * 0.22) * coupling,
    // Keep the loaded low voice at every speed. Acceleration adds roughness
    // above it instead of crossfading into a single, bell-like high note.
    harmonic: energy * (1 - register * 0.25),
    overtone: energy * register * 0.38,
    upper: energy * high * 0.08,
    cutoff:
      (180 +
        register * 420 +
        p.throttle * 650 +
        p.load * 250 +
        clamp(attack) * 420) *
      0.6 *
      (1 - constraint * 0.45),
    drive:
      1.05 + p.load * 0.42 + p.throttle * 0.2 + constraint * p.throttle * 0.25,
  };
}

/** One short accent when the player applies the throttle. It cannot repeat
 * while the throttle stays down. */
export class ThrottleAttack {
  private follower = 0;
  private time: number | null = null;
  reset() {
    this.follower = 0;
    this.time = null;
  }
  update(throttle: number, time: number) {
    const dt = this.time === null ? 0 : Math.max(0, time - this.time);
    this.time = time;
    this.follower += (throttle - this.follower) * (1 - Math.exp(-dt / 0.065));
    return Math.max(0, throttle - this.follower);
  }
}
