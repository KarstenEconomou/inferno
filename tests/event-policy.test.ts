import { describe, expect, it } from "vitest";
import {
  eventGain,
  eventStrength,
  impactArticulation,
  lowestPriorityVoice,
  sameEventVictim,
} from "../src/audio/event-policy";
import type { AudioEvent, Bus } from "../src/audio/model";

const voice = (event: AudioEvent, priority = 5, bus: Bus = "gameplay") => ({
  event,
  bus,
  priority,
});

describe("event arbitration policy", () => {
  it("steals the oldest same-event voice once the per-event limit is reached", () => {
    const voices = [voice("checkpoint.hit", 7), voice("checkpoint.hit", 7)];
    expect(sameEventVictim(voices, "checkpoint.hit")).toBe(voices[0]);
    expect(
      sameEventVictim([voice("checkpoint.hit", 7)], "checkpoint.hit"),
    ).toEqual(voice("checkpoint.hit", 7));
  });
  it("caps all ui events at two voices regardless of their event identity", () => {
    const voices = [voice("ui.move", 4, "ui"), voice("ui.confirm", 5, "ui")];
    expect(sameEventVictim(voices, "ui.back")).toBe(voices[0]);
    expect(sameEventVictim(voices.slice(0, 1), "ui.back")).toBeUndefined();
  });
  it("allows two simultaneous contact voices but one for every other gameplay event", () => {
    const impact = [voice("vehicle.impact", 8), voice("vehicle.impact", 8)];
    const land = [voice("vehicle.land", 8), voice("vehicle.land", 8)];
    const jump = [voice("vehicle.jump", 5), voice("vehicle.jump", 5)];
    expect(sameEventVictim(impact, "vehicle.impact")).toBe(impact[0]);
    expect(sameEventVictim(land, "vehicle.land")).toBe(land[0]);
    expect(sameEventVictim(jump, "vehicle.jump")).toBe(jump[0]);
    expect(
      sameEventVictim(
        [voice("vehicle.impact", 8), voice("vehicle.jump", 5)],
        "vehicle.impact",
      ),
    ).toBeUndefined();
  });
  it("steals the lowest-priority voice for the global ceiling", () => {
    const voices = [
      voice("race.pb", 9),
      voice("ui.move", 4, "ui"),
      voice("race.start", 8),
    ];
    expect(lowestPriorityVoice(voices)).toBe(voices[1]);
    expect(lowestPriorityVoice([voice("race.start", 8)])).toEqual(
      voice("race.start", 8),
    );
  });
  it("clamps strength and preserves authored gains without an explicit strength", () => {
    expect(eventStrength(undefined)).toBe(1);
    expect(eventStrength(2)).toBe(1);
    expect(eventStrength(-3)).toBe(0);
    expect(eventStrength(0.7)).toBe(0.7);
    expect(eventGain("vehicle.impact", 0.8, true)).toBeCloseTo(0.304);
    expect(eventGain("vehicle.impact", 0.8, false)).toBe(0.38);
    expect(eventGain("vehicle.impact", 0, true)).toBe(0);
    expect(eventGain("ui.confirm", 0.7, true)).toBe(0.23 * (0.25 + 0.75 * 0.7));
    expect(eventGain("vehicle.jump", 0, true)).toBe(0.23 * 0.25);
  });
  it("gives harder contacts more brightness and duration with bounded severity selection", () => {
    const light = impactArticulation(0.2),
      medium = impactArticulation(0.5),
      hard = impactArticulation(1);
    expect([light.variant, medium.variant, hard.variant]).toEqual([0, 1, 2]);
    expect(impactArticulation(2)).toEqual(hard);
    for (const field of ["cutoff", "hold", "release"] as const) {
      expect(light[field]).toBeLessThan(medium[field]);
      expect(medium[field]).toBeLessThan(hard[field]);
    }
  });
});
