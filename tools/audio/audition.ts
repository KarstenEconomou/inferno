/** A sequential listening sheet, not game music. No external audio input. */
import { writeFileSync } from "node:fs";
import { createMonoWav } from "./pcm.ts";
import { synthesize, SAMPLE_RATE } from "../../src/audio/synthesis.ts";
import { themeFor } from "../../src/audio/themes.ts";
import { events, recipes } from "../../src/audio/model.ts";
const output = process.argv[2] ?? "/tmp/inferno-vertigo-kit.wav";
const theme = themeFor("vertigo");
const chunks: Float32Array[] = [];
const cues: { seconds: number; event: string }[] = [];
let offset = 0;
for (const event of events) {
  const data = synthesize(event, theme);
  const pad = new Float32Array(
    Math.ceil((recipes[event].duration + 0.42) * SAMPLE_RATE),
  );
  const gain = recipes[event].gain;
  for (let i = 0; i < data.length; i++) pad[i] = data[i] * gain;
  chunks.push(pad);
  cues.push({ seconds: Number((offset / SAMPLE_RATE).toFixed(3)), event });
  offset += pad.length;
}
// One common preview gain, preserving authored relative levels between events.
let peak = 0;
for (const chunk of chunks)
  for (const value of chunk) peak = Math.max(peak, Math.abs(value));
const gain = 0.75 / peak;
const wav = createMonoWav(offset, 16);
let cursor = 44;
for (const chunk of chunks)
  for (const value of chunk) {
    wav.writeInt16LE(Math.round(value * gain * 32767), cursor);
    cursor += 2;
  }
writeFileSync(output, wav);
writeFileSync(
  output.replace(/\.wav$/, ".json"),
  JSON.stringify(
    { theme: theme.id, harmony: theme.harmony!.name, previewGain: gain, cues },
    null,
    2,
  ) + "\n",
);
console.log(output);
