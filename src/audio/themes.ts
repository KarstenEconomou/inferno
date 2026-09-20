import { midiHz, type Harmony } from "./harmony.ts";
/** Original timbres, not transcriptions or commercial presets. */
export type SoundTheme = {
  id: string;
  harmony?: Harmony;
  fieldTimbre: { fundamental: number; color: number; drive: number };
  structureTimbre: { center: number; metal: number; noise: number };
  signalTimbre: { center: number; resonance: number; fm: number };
  ambienceProfile: { bed: number; air: number; bars: number; density: number };
  impulseProfile: { decay: number; metal: number };
};
export const soundThemes: SoundTheme[] = [
  {
    id: "vertigo",
    harmony: { name: "G♯ minor", rootMidi: 32, scale: [0, 2, 3, 5, 7, 8, 10] },
    fieldTimbre: { fundamental: midiHz(32), color: 0.16, drive: 1.45 },
    structureTimbre: { center: midiHz(87), metal: 0.42, noise: 0.5 },
    signalTimbre: { center: midiHz(92), resonance: 2.4, fm: 0.22 },
    ambienceProfile: { bed: midiHz(32), air: 620, bars: 4, density: 0.65 },
    impulseProfile: { decay: 0.065, metal: 0.42 },
  },
  {
    id: "spillway",
    fieldTimbre: { fundamental: 44, color: 0.08, drive: 1.1 },
    structureTimbre: { center: 900, metal: 0.3, noise: 1 },
    signalTimbre: { center: 3400, resonance: 2, fm: 1.6 },
    ambienceProfile: { bed: 38, air: 480, bars: 8, density: 0.8 },
    impulseProfile: { decay: 0.13, metal: 0.35 },
  },
  {
    id: "terminal",
    fieldTimbre: { fundamental: 52, color: 0.12, drive: 1.2 },
    structureTimbre: { center: 2200, metal: 0.5, noise: 0.45 },
    signalTimbre: { center: 4200, resonance: 1.2, fm: 0.2 },
    ambienceProfile: { bed: 42, air: 1100, bars: 8, density: 0.45 },
    impulseProfile: { decay: 0.045, metal: 0.8 },
  },
  {
    id: "mirage",
    fieldTimbre: { fundamental: 50, color: 0.07, drive: 1.05 },
    structureTimbre: { center: 1750, metal: 0.3, noise: 0.3 },
    signalTimbre: { center: 3600, resonance: 3, fm: 2.2 },
    ambienceProfile: { bed: 50, air: 1350, bars: 4, density: 0.6 },
    impulseProfile: { decay: 0.075, metal: 0.4 },
  },
  {
    id: "burnline",
    fieldTimbre: { fundamental: 42, color: 0.2, drive: 1.5 },
    structureTimbre: { center: 700, metal: 0.22, noise: 0.8 },
    signalTimbre: { center: 2300, resonance: 4, fm: 0.35 },
    ambienceProfile: { bed: 35, air: 1700, bars: 8, density: 0.25 },
    impulseProfile: { decay: 0.055, metal: 0.25 },
  },
];
export const themeFor = (id: string) =>
  soundThemes.find((t) => t.id === id) ?? soundThemes[0];
