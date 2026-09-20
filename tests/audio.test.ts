import { inKey, midiHz, tunedDrivetrain } from "../src/audio/harmony";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  GRID,
  events,
  recipes,
  Transport,
  vehicleParameters,
  idleTelemetry,
  parseMix,
} from "../src/audio/model";
import { soundThemes } from "../src/audio/themes";
import { synthesize, measure, SAMPLE_RATE } from "../src/audio/synthesis";
import { decodeBankEntry } from "../src/audio/bank";
import { encodeBankPcm, encodeMasterWav } from "../tools/audio/pcm";
describe("original sonic system", () => {
  it("uses exact 128 BPM subdivisions without resetting transport phase", () => {
    expect(GRID.quarter).toBe(0.46875);
    expect(GRID.eighth).toBe(0.234375);
    expect(GRID.sixteenth).toBe(0.1171875);
    expect(GRID.bar).toBe(1.875);
    const t = new Transport(2);
    expect(t.phase(3.875)).toEqual({ beats: 4, bar: 1, phase: 0 });
    expect(t.next(2.05)).toBe(2.234375);
  });
  it("makes clean contact leaner than wasteful grip and unloads in the air", () => {
    const clean = vehicleParameters({
      ...idleTelemetry,
      active: true,
      speed: 45,
      forward: 45,
      throttle: 1,
    });
    const bad = vehicleParameters({
      ...idleTelemetry,
      active: true,
      speed: 45,
      forward: 40,
      throttle: 1,
      slip: 0.9,
      scrape: true,
    });
    const air = vehicleParameters({
      ...idleTelemetry,
      active: true,
      speed: 45,
      forward: 45,
      throttle: 1,
      grounded: false,
      slip: 0.9,
    });
    expect(clean.tire).toBe(0);
    expect(bad.tire).toBeGreaterThan(0);
    expect(bad.scrape).toBeGreaterThan(0);
    expect(bad.load).toBeLessThan(clean.load);
    expect(air.body).toBeLessThan(clean.body * 0.3);
    expect(air.tire).toBe(0);
    expect(air.rpm).toBeGreaterThan(clean.rpm);
    expect(
      vehicleParameters({ ...idleTelemetry, throttle: 1, brake: true })
        .throttle,
    ).toBe(0);
  });
  it("simplifies environment with speed and boost", () => {
    const slow = vehicleParameters({ ...idleTelemetry, speed: 10 });
    const fast = vehicleParameters({ ...idleTelemetry, speed: 70 });
    expect(fast.environment).toBeLessThan(slow.environment);
    expect(
      vehicleParameters({ ...idleTelemetry, speed: 70, boost: true })
        .environment,
    ).toBeLessThan(fast.environment);
  });
  it("keeps propulsion in a powered drift and separates pedal friction from slip", () => {
    const rolling = { ...idleTelemetry, speed: 65, forward: 62, throttle: 1 };
    const slide = vehicleParameters({
      ...rolling,
      brake: true,
      poweredDrift: true,
      slip: 0.55,
    });
    const braking = vehicleParameters({ ...rolling, brake: true });
    expect(slide.throttle).toBe(1);
    expect(slide.load).toBeGreaterThan(0.9);
    expect(slide.tire).toBeGreaterThan(0.04);
    expect(slide.brake).toBe(0);
    expect(braking.throttle).toBe(0);
    expect(braking.brake).toBeGreaterThan(0.08);
    expect(braking.tire).toBe(0);
    expect(vehicleParameters({ ...rolling, throttle: -1 }).brake).toBe(
      braking.brake,
    );
    // Lifting restores braking even before the slide has recovered.
    expect(
      vehicleParameters({
        ...rolling,
        throttle: 0,
        brake: true,
        poweredDrift: true,
      }).brake,
    ).toBe(braking.brake);
    for (const patch of [{ speed: 0, forward: 0 }, { grounded: false }]) {
      const stopped = vehicleParameters({
        ...rolling,
        brake: true,
        slip: 1,
        ...patch,
      });
      expect(stopped.brake).toBe(0);
      expect(stopped.tire).toBe(0);
    }
    expect(
      vehicleParameters({ ...rolling, forward: -15, brake: true }).brake,
    ).toBe(0);
  });
  it("gives boost a soft, long synth decay below the start cue", () => {
    for (const theme of soundThemes) {
      const sound = synthesize("vehicle.boost.enter", theme);
      const rms = (from: number, to: number) =>
        measure(sound.slice(from * SAMPLE_RATE, to * SAMPLE_RATE)).rms;
      expect(rms(0.012, 0.04)).toBeGreaterThan(rms(0, 0.004) * 2);
      expect(rms(0.45, 0.55)).toBeGreaterThan(rms(0.04, 0.12) * 0.15);
      expect(rms(0.45, 0.55)).toBeLessThan(rms(0.04, 0.12) * 0.4);
      expect(rms(0.95, 1.05)).toBeGreaterThan(0.002);
      expect(rms(0.95, 1.05)).toBeLessThan(rms(0.45, 0.55) * 0.3);
      expect(sound.length / SAMPLE_RATE).toBe(1.2);
      expect(
        measure(sound).peak * recipes["vehicle.boost.enter"].gain,
      ).toBeLessThan(
        measure(synthesize("race.start", theme)).peak *
          recipes["race.start"].gain,
      );
    }
  });
  it("keeps restart and PB within their duration budgets", () => {
    expect(recipes["race.restart"].duration).toBe(0.1);
    expect(recipes["race.respawn"].duration).toBe(0.2);
    expect(recipes["race.pb"].duration).toBeLessThanOrEqual(GRID.bar);
    expect(recipes["ui.move"].duration).toBeLessThan(0.05);
  });
  it("makes collision severity audible in the generated body and decay across every theme", () => {
    for (const theme of soundThemes) {
      const hits = [0, 1, 2].map((variant) =>
        synthesize("vehicle.impact", theme, variant),
      );
      const tail = hits.map(
        (hit) => measure(hit.slice(0.1 * SAMPLE_RATE, 0.18 * SAMPLE_RATE)).rms,
      );
      expect(tail[1]).toBeGreaterThan(tail[0] * 1.5);
      expect(tail[2]).toBeGreaterThan(tail[1] * 1.3);
      for (const hit of hits) {
        expect(measure(hit).peak).toBeLessThan(0.73);
        expect(measure(hit).peak).toBeGreaterThan(0.1);
        expect(Math.abs(measure(hit).dc)).toBeLessThan(0.003);
        expect(hit[0]).toBe(0);
        expect(Math.abs(hit.at(-1)!)).toBe(0);
        expect(measure(hit.slice(0.23 * SAMPLE_RATE)).rms).toBeLessThan(
          measure(hit.slice(0.01 * SAMPLE_RATE, 0.05 * SAMPLE_RATE)).rms * 0.08,
        );
      }
    }
  });
  it("generates every theme deterministically with headroom and click-free boundaries", () => {
    for (const theme of soundThemes)
      for (const event of events) {
        const a = synthesize(event, theme);
        expect(a).toEqual(synthesize(event, theme));
        const stats = measure(a);
        expect(stats.peak).toBeLessThan(0.73);
        expect(stats.peak).toBeGreaterThan(0.005);
        expect(Math.abs(stats.dc)).toBeLessThan(0.003);
        expect(Math.abs(a[0])).toBe(0);
        expect(Math.abs(a.at(-1)!)).toBe(0);
        expect(a.length).toBe(Math.ceil(recipes[event].duration * SAMPLE_RATE));
      }
  });
  it("varies repeated UI hits and transforms timbre across identities", () => {
    const hash = (x: Float32Array) =>
      createHash("sha256").update(new Uint8Array(x.buffer)).digest("hex");
    expect(
      new Set(soundThemes.map((t) => hash(synthesize("ui.confirm", t)))).size,
    ).toBe(5);
    expect(
      new Set(
        Array.from({ length: 4 }, (_, i) =>
          hash(synthesize("ui.move", soundThemes[0], i)),
        ),
      ).size,
    ).toBe(4);
  });
  it("ships the exact generated banks and 24-bit masters", () => {
    const manifest = JSON.parse(
      readFileSync("public/audio/manifest.json", "utf8"),
    );
    expect(manifest.rate).toBe(48000);
    for (const theme of soundThemes) {
      const bank = manifest.themes[theme.id];
      const bytes = readFileSync(`public/audio/${bank.file}`);
      expect(bytes.length).toBe(bank.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        bank.sha256,
      );
      const wav = readFileSync(
        `tools/audio/sources/${theme.id}--race.restart--1.wav`,
      );
      expect(wav.readUInt16LE(34)).toBe(24);
      expect(wav.readUInt32LE(24)).toBe(48000);
    }
  });
  it("keeps Vertigo tonal tails and continuous voices in G-sharp minor", () => {
    const harmony = soundThemes[0].harmony!;
    const pitchClasses = new Set([8, 10, 11, 1, 3, 4, 6]);
    for (const hz of [
      ...Object.values(tunedDrivetrain(harmony)),
      ...Array.from({ length: 200 }, (_, i) => inKey(30 + i * 27, harmony)),
    ]) {
      const note = 69 + 12 * Math.log2(hz / 440);
      expect(Math.abs(note - Math.round(note))).toBeLessThan(1e-8);
      expect(pitchClasses.has(Math.round(note) % 12)).toBe(true);
    }
    // Inspect the generated boost line itself, rather than only its configuration.
    const pulse = synthesize("vehicle.boost.enter", soundThemes[0]);
    let measured = 0,
      strongest = -Infinity;
    for (let hz = 185; hz <= 230; hz += 0.1) {
      let real = 0,
        imag = 0;
      const first = Math.floor(0.1 * SAMPLE_RATE),
        last = Math.floor(0.3 * SAMPLE_RATE);
      for (let i = first; i < last; i++) {
        const window =
          0.5 - 0.5 * Math.cos((2 * Math.PI * (i - first)) / (last - first));
        real +=
          pulse[i] * window * Math.cos((2 * Math.PI * hz * i) / SAMPLE_RATE);
        imag +=
          pulse[i] * window * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE);
      }
      const power = real * real + imag * imag;
      if (power > strongest) {
        strongest = power;
        measured = hz;
      }
    }
    expect(Math.abs(1200 * Math.log2(measured / midiHz(56)))).toBeLessThan(35);
  });
  it("sanitizes persisted mix gains", () => {
    expect(parseMix({ master: NaN, sfx: 100, music: -1 }).master).toBe(0.65);
    expect(parseMix({ sfx: 100 }).sfx).toBe(1);
    expect(parseMix({ music: -1 }).music).toBe(0);
  });
  it("round-trips bank samples through the shipped little-endian int16 codec", () => {
    const samples = synthesize("ui.confirm", soundThemes[0]);
    const pcm = encodeBankPcm(samples);
    expect(pcm.length).toBe(samples.length * 2);
    const decoded = new Float32Array(samples.length);
    decodeBankEntry(
      new DataView(pcm.buffer),
      { offset: 0, length: samples.length },
      decoded,
    );
    expect(decoded[0]).toBe(0);
    const first = samples.findIndex((v) => v !== 0);
    expect(Math.abs(decoded[first] - samples[first])).toBeLessThan(1 / 32768);
    expect(Math.abs(decoded.at(-1)!)).toBe(0);
  });
  it("writes 48 kHz mono masters with the documented 24-bit frame layout", () => {
    const wav = encodeMasterWav(synthesize("race.restart", soundThemes[1]));
    expect(wav.readUInt32LE(24)).toBe(48000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt16LE(34)).toBe(24);
    expect(wav.readUInt32LE(28)).toBe(SAMPLE_RATE * 3);
    expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
  });
});
