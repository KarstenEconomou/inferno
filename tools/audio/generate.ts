import { mkdirSync, writeFileSync } from "node:fs";
import { encodeBankPcm, encodeMasterWav } from "./pcm.ts";
import { createHash } from "node:crypto";
import { events, recipes, GRID } from "../../src/audio/model.ts";
import { soundThemes } from "../../src/audio/themes.ts";
import { synthesize, SAMPLE_RATE, measure } from "../../src/audio/synthesis.ts";
const root = new URL("../../public/audio/", import.meta.url),
  sources = new URL("./sources/", import.meta.url);
mkdirSync(root, { recursive: true });
mkdirSync(sources, { recursive: true });
const manifest = {
  version: 1,
  rate: SAMPLE_RATE,
  bpm: 128,
  grid: GRID,
  themes: {} as Record<string, unknown>,
};
for (const theme of soundThemes) {
  const entries: Record<
    string,
    { offset: number; length: number; peak: number; rms: number; dc: number }[]
  > = {};
  const chunks: Buffer[] = [];
  let offset = 0;
  for (const event of events) {
    entries[event] = [];
    for (let i = 0; i < recipes[event].variants; i++) {
      const data = synthesize(event, theme, i),
        stats = measure(data);
      if (!Number.isFinite(stats.peak) || stats.peak > 0.73)
        throw Error(`Invalid peak ${theme.id}/${event}`);
      const source = encodeMasterWav(data);
      writeFileSync(
        new URL(`${theme.id}--${event}--${i + 1}.wav`, sources),
        source,
      );
      const pcm = encodeBankPcm(data);
      entries[event].push({ offset, length: data.length, ...stats });
      offset += data.length;
      chunks.push(pcm);
    }
  }
  const bank = Buffer.concat(chunks),
    file = `${theme.id}.pcm`;
  writeFileSync(new URL(file, root), bank);
  manifest.themes[theme.id] = {
    file,
    bytes: bank.length,
    sha256: createHash("sha256").update(bank).digest("hex"),
    entries,
  };
}
writeFileSync(
  new URL("manifest.json", root),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Generated ${soundThemes.length} original sound themes; 48 kHz / 24-bit WAV masters and 16-bit PCM runtime banks. No external audio sources.`,
);
