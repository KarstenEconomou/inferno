/** Rules that decide which event sounds play and how loud they are. The
 * director applies them; keeping them here makes each rule testable alone. */
import { recipes, type AudioEvent, type Bus } from "./model.ts";

type EventVoice = { event: AudioEvent; bus: Bus; priority: number };

export function sameEventVictim<T extends EventVoice>(
  voices: readonly T[],
  event: AudioEvent,
): T | undefined {
  const ui = event.startsWith("ui.");
  const same = voices.filter((voice) =>
    ui ? voice.bus === "ui" : voice.event === event,
  );
  const limit =
    ui || event === "vehicle.impact" || event === "vehicle.land" ? 2 : 1;
  return same.length >= limit ? same[0] : undefined;
}

export function lowestPriorityVoice<T extends EventVoice>(
  voices: readonly T[],
): T {
  return voices.reduce((a, b) => (a.priority < b.priority ? a : b));
}

export function eventStrength(strength: number | undefined) {
  return Math.max(0, Math.min(1, strength ?? 1));
}

export function eventGain(
  event: AudioEvent,
  strength: number,
  explicitStrength: boolean,
) {
  return (
    recipes[event].gain *
    (!explicitStrength
      ? 1
      : event === "vehicle.impact"
        ? strength
        : 0.25 + 0.75 * strength)
  );
}

/** Collision strength controls the articulation as well as the level. */
export function impactArticulation(strength: number) {
  const s = eventStrength(strength);
  return {
    variant: Math.min(2, Math.floor(s * 3)),
    cutoff: 550 + s * 2100,
    hold: 0.012 + s * 0.025,
    release: 0.018 + s * 0.065,
  };
}
