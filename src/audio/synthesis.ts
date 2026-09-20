import { inKey, midiHz } from "./harmony.ts";
import { GRID, recipes, type AudioEvent } from "./model.ts";
import type { SoundTheme } from "./themes.ts";
export const SAMPLE_RATE = 48000;
export function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    return ((n >>> 0) / 4294967296) * 2 - 1;
  };
}
function seedFor(text: string) {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
/** Every sound starts here, from oscillators and filtered noise. The project
 * uses no recorded sample, no preset and no external music. */
export function synthesize(
  event: AudioEvent,
  theme: SoundTheme,
  variant = 0,
  rate = SAMPLE_RATE,
): Float32Array {
  const duration = recipes[event].duration,
    out = new Float32Array(Math.ceil(duration * rate));
  const rnd = random(seedFor(`${theme.id}/${event}/${variant}`));
  const tuned = theme.harmony;
  const base = theme.fieldTimbre.fundamental,
    metal = theme.structureTimbre.metal,
    signal = theme.signalTimbre.center;
  function tone(
    at: number,
    len: number,
    freq: number,
    end: number,
    amp: number,
    color = 0,
    fm = 0,
  ) {
    // A tuned theme locks its audible tail to the scale. The first few
    // milliseconds keep a percussive pitch attack, and no long sweep.
    if (tuned) {
      freq = inKey(freq, tuned);
      end = inKey(end, tuned);
    }
    let phase = 0;
    const count = Math.min(
      Math.ceil(len * rate),
      out.length - Math.floor(at * rate),
    );
    for (let i = 0; i < count; i++) {
      const t = i / rate,
        u = t / len;
      phase +=
        (2 *
          Math.PI *
          (end + (freq - end) * Math.exp(-t * (tuned ? 480 : 38)))) /
        rate;
      const envelope =
        Math.min(1, t / 0.0015) *
        Math.exp(-u * (tuned ? 4.8 : 5.5)) *
        Math.min(1, (len - t) / 0.009);
      const x =
        Math.sin(
          phase +
            fm *
              (tuned ? 0.35 : 1) *
              Math.sin(phase * (tuned ? 2 : 2.73)) *
              Math.exp(-t * 45),
        ) +
        color *
          (Math.sin(phase * 3) * 0.25 + Math.sin(phase * 5) * 0.1) *
          Math.exp(-t * 15);
      out[Math.floor(at * rate) + i] += x * envelope * amp;
    }
  }
  function noise(
    at: number,
    len: number,
    center: number,
    amp: number,
    up = false,
  ) {
    if (tuned) amp *= 0.42;
    let low = 0,
      band = 0;
    const count = Math.min(
      Math.ceil(len * rate),
      out.length - Math.floor(at * rate),
    );
    for (let i = 0; i < count; i++) {
      const t = i / rate,
        u = t / len;
      const hz = Math.min(10000, center * (up ? 0.3 + u * 1.7 : 1.4 - u));
      const coefficient = 2 * Math.sin((Math.PI * hz) / rate),
        high = rnd() - low - 0.85 * band;
      band += coefficient * high;
      low += coefficient * band;
      const envelope =
        Math.min(1, t / 0.0008) *
        Math.exp(-u * (up ? 1.5 : 5)) *
        Math.min(1, (len - t) / 0.007);
      out[Math.floor(at * rate) + i] += band * envelope * amp;
    }
  }
  const kick = (at = 0, amp = 0.6) => {
    tone(at, tuned ? 0.145 : 0.16, tuned ? base * 3 : 135, base, amp, 0.06);
    noise(at, tuned ? 0.007 : 0.012, 3500, tuned ? 0.018 : 0.035);
  };
  const pluck = (at = 0, amp = 0.5, len = 0.17) => {
    if (!tuned) {
      tone(
        at,
        len,
        base * 2.05,
        base,
        amp,
        0.6 * theme.fieldTimbre.drive,
        0.08,
      );
      return;
    }
    // The root stays at one pitch. The upper harmonics decay, which gives
    // the movement of a filter.
    tone(at, len, base, base, amp * 0.82, theme.fieldTimbre.color);
    tone(at, len * 0.52, base * 2, base * 2, amp * 0.24, 0.55, 0.12);
    tone(at, len * 0.26, base * 4, base * 4, amp * 0.08, 0.3);
  };
  const relay = (at = 0, amp = 0.3, len = 0.035) => {
    noise(
      at,
      tuned ? len * 0.65 : len,
      theme.structureTimbre.center * (1 + variant * 0.07),
      amp * (tuned ? 0.72 : 1),
    );
    const ring = tuned
      ? midiHz(tuned.rootMidi + 48 + [0, 7, 12, 7][variant % 4])
      : 1320;
    tone(
      at,
      len,
      tuned ? ring : 1450 + variant * 93,
      ring,
      amp * (tuned ? 0.12 : 0.2),
      metal,
      metal * 1.8,
    );
  };
  const stab = (at = 0, amp = 0.22) => {
    if (tuned) {
      // One static minor chord. There is no melody and no sampled attack.
      const root = base * 4;
      tone(at, 0.115, root, root, amp, 0.85, 0.18);
      tone(
        at,
        0.085,
        root * 2 ** (3 / 12),
        root * 2 ** (3 / 12),
        amp * 0.24,
        0.5,
      );
      tone(
        at,
        0.1,
        root * 2 ** (7 / 12),
        root * 2 ** (7 / 12),
        amp * 0.38,
        0.6,
      );
      noise(at, 0.009, signal, 0.018);
      tone(at + GRID.sixteenth, 0.048, root, root, amp * 0.09, 0.25);
      return;
    }
    // One inharmonic interval, not a phrase. A sixteenth-note gate closes
    // the tail.
    tone(at, 0.14, 310, 294, amp, 0.7, theme.signalTimbre.fm);
    tone(at, 0.13, 443, 431, amp * 0.6, 0.5, 0.25);
    noise(at, 0.021, signal, 0.035);
    tone(at + GRID.sixteenth, 0.06, 294, 294, amp * 0.12, 0.3);
  };
  // One warm synth line. A small third/fifth-harmonic edge softens early,
  // leaving the accepted root/fifth tail without a noise or filter sweep.
  const boostLine = (amp = 0.32, decay = 0.32) => {
    const root = tuned ? midiHz(tuned.rootMidi + 24) : base * 4;
    const fifth = tuned ? inKey(root * 1.5, tuned) : root * 1.5;
    for (let i = 0; i < out.length; i++) {
      const t = i / rate;
      const attack = 1 - Math.exp(-t / 0.009);
      const tail = Math.exp(-t / decay) * Math.min(1, (duration - t) / 0.08);
      const phase = 2 * Math.PI * root * t;
      const core =
        Math.sin(phase) +
        0.28 * Math.sin(2 * Math.PI * fifth * t) +
        (0.12 + theme.fieldTimbre.color) *
          Math.exp(-t / (decay * 0.6)) *
          Math.sin(phase * 2) +
        Math.exp(-t / (decay * 0.55)) *
          (0.065 * Math.sin(phase * 3) + 0.022 * Math.sin(phase * 5));
      out[i] += core * attack * tail * amp;
    }
  };
  // Three severity articulations share one low root. The brief phase bend
  // and metallic sidebands settle before the body decays, so a hit reads as
  // a compact knock rather than a reward chord, laser or noise burst.
  const impact = () => {
    const severity = [0.2, 0.55, 1][variant % 3];
    const root = tuned ? midiHz(tuned.rootMidi + 12) : base * 2;
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / rate;
      phase +=
        (2 *
          Math.PI *
          root *
          (1 + (0.06 + severity * 0.16) * Math.exp(-t / 0.007))) /
        rate;
      const bite = Math.exp(-t / (0.012 + severity * 0.01));
      const body = Math.sin(
        phase +
          (0.12 + severity * 0.6) *
            bite *
            Math.sin(phase * (2.5 + metal * 0.4)),
      );
      const edge =
        bite *
        ((0.1 + severity * 0.12) * Math.sin(phase * 3) +
          severity * 0.055 * Math.sin(phase * 5));
      const envelope =
        (1 - Math.exp(-t / 0.0015)) *
        Math.exp(-t / (0.028 + severity * 0.047)) *
        Math.min(1, (duration - t) / 0.025);
      out[i] += (body + edge) * envelope * 0.52;
    }
  };
  switch (event) {
    case "ui.move":
      relay(0, 0.38, 0.022 + variant * 0.002);
      break;
    case "ui.confirm":
      relay(0, 0.22);
      pluck(0.002, 0.45, 0.12);
      break;
    case "ui.back":
      noise(0, 0.07, 900, 0.18);
      tone(0, 0.095, 240, 82, 0.43, 0.2);
      break;
    case "ui.denied":
      relay(0, 0.16, 0.026);
      tone(0, 0.038, 320, 220, 0.22);
      break;
    case "ui.panel":
      noise(0, 0.04, 1300, 0.24);
      break;
    case "race.restart":
      noise(0, 0.065, 2200, 0.22);
      noise(0.028, 0.048, 700, 0.15, true);
      tone(0, 0.09, 180, 38, 0.5, 0.1);
      break;
    case "race.respawn":
      noise(0, 0.1, 800, 0.19, true);
      relay(0.065, 0.2, 0.035);
      pluck(0.09, 0.38, 0.1);
      break;
    case "race.invalid":
      relay(0, 0.25);
      tone(0.055, 0.16, 220, 140, 0.36, 0.5, 0.8);
      break;
    case "race.count.3":
      relay(0, 0.33, 0.045);
      tone(0, 0.1, 160, 110, 0.3);
      break;
    case "race.count.2":
      relay(0, 0.4, 0.045);
      pluck(0, 0.38, 0.13);
      break;
    case "race.count.1":
      relay(0, 0.4, 0.05);
      kick(0, 0.44);
      noise(0.05, 0.1, 1800, 0.05, true);
      break;
    case "race.start":
      kick(0, 0.64);
      stab(0.004, 0.17);
      break;
    case "race.finish":
      kick(0, 0.52);
      stab(0.004, 0.2);
      break;
    case "race.pb":
      kick(0, 0.65);
      stab(0.009, 0.21);
      pluck(GRID.eighth, 0.45);
      pluck(GRID.quarter, 0.36);
      pluck(GRID.quarter + GRID.sixteenth * 3, 0.32);
      relay(GRID.quarter + GRID.eighth, 0.15);
      relay(GRID.quarter * 2 + GRID.sixteenth, 0.1, 0.025);
      noise(GRID.quarter * 2, 0.08, 6500, 0.04);
      break;
    case "checkpoint.hit":
      relay(0, 0.35, 0.045);
      break;
    case "checkpoint.ahead":
      relay(0, 0.24, 0.032);
      tone(0.007, 0.052, signal * 0.7, signal, 0.23, 0, theme.signalTimbre.fm);
      tone(GRID.sixteenth, 0.045, signal, signal, 0.045);
      break;
    case "checkpoint.behind":
      relay(0, 0.26, 0.032);
      tone(0.008, 0.09, 260, 180, 0.27, 0.2);
      break;
    case "vehicle.boost.enter":
      boostLine();
      break;
    case "vehicle.boost.loop":
      // A quieter lab preview; gameplay never schedules repeated boost notes.
      boostLine(0.2);
      break;
    case "vehicle.boost.exit":
      boostLine(0.06, 0.06);
      break;
    case "vehicle.jump":
      tone(0, 0.09, 120, 55, 0.4);
      relay(0, 0.19, 0.025);
      noise(0.008, 0.13, 1400, 0.2, true);
      break;
    case "vehicle.land":
      kick(0, 0.6);
      relay(0.004, 0.2 + metal * 0.12, 0.06);
      tone(
        0.015,
        theme.impulseProfile.decay * 1.7,
        180,
        96,
        0.24,
        metal,
        metal,
      );
      noise(0.04, 0.12, 700, 0.14);
      break;
    case "vehicle.impact":
      impact();
      break;
    case "vehicle.scrape":
      // Lab-only contact preview. Gameplay uses one continuous tonal rasp.
      tone(0, duration, base * 3, base * 3, 0.2, 0.65, 0.25);
      break;
    case "environment.pulse":
      tone(0, 0.18, base * 2.1, base * 2, 0.3, 0.4);
      relay(0, 0.2, 0.035);
      break;
  }
  // Remove the offset, saturate, set the headroom, and fade both ends so no
  // boundary can click.
  let previous = 0,
    dc = 0;
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    dc = x - previous + (tuned ? 0.998 : 0.995) * dc;
    previous = x;
    out[i] =
      Math.tanh(dc * (tuned ? 1.12 : 1.25)) *
      0.72 *
      Math.min(1, i / 32, (out.length - 1 - i) / 160);
  }
  return out;
}
export function measure(samples: Float32Array) {
  let peak = 0,
    square = 0,
    dc = 0;
  for (const v of samples) {
    peak = Math.max(peak, Math.abs(v));
    square += v * v;
    dc += v;
  }
  return {
    peak,
    rms: Math.sqrt(square / samples.length),
    dc: dc / samples.length,
  };
}
