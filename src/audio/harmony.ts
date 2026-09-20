/** Musical scale for the pitched tails. A percussive attack and broadband
 * contact noise stay outside the scale. */
export type Harmony = {
  rootMidi: number;
  scale: readonly number[];
  name: string;
};
export const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export function inKey(hz: number, harmony: Harmony): number {
  const note = 69 + 12 * Math.log2(hz / 440);
  let best = harmony.rootMidi,
    distance = Infinity;
  for (let octave = -3; octave <= 8; octave++) {
    for (const degree of harmony.scale) {
      const candidate = harmony.rootMidi + octave * 12 + degree;
      if (Math.abs(note - candidate) < distance) {
        best = candidate;
        distance = Math.abs(note - candidate);
      }
    }
  }
  return midiHz(best);
}

/** A fixed stack of root and harmonics. The drivetrain thus does not play a
 * melody up the scale as the car accelerates. */
export function tunedDrivetrain(harmony: Harmony) {
  return {
    body: midiHz(harmony.rootMidi - 12),
    harmonic: midiHz(harmony.rootMidi),
    machinery: midiHz(harmony.rootMidi + 7),
  };
}
