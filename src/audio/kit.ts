import { decodeBankEntry, type BankManifest } from "./bank.ts";
import { events, recipes, type AudioEvent } from "./model.ts";
import { SAMPLE_RATE, synthesize } from "./synthesis.ts";
import { soundThemes, type SoundTheme } from "./themes.ts";

/** Events that every theme keeps resident before the bank arrives, so a cold
 * or offline start still has interface and restart sounds. */
const SAFETY_KIT: AudioEvent[] = [
  "ui.move",
  "ui.confirm",
  "ui.back",
  "ui.denied",
  "race.restart",
  "race.start",
];

/** The sound kit holds one decoded buffer for each event variant of each
 * theme. Buffers come from the pre-rendered bank; if that bank cannot be
 * fetched, the same waveforms are synthesised in the browser instead. */
export class SoundKit {
  ready = false;
  fault = "";
  private buffers = new Map<string, AudioBuffer[]>();
  private loading: Promise<void> | null = null;

  private static key(themeId: string, event: AudioEvent) {
    return `${themeId}/${event}`;
  }

  /** Fetch and expand every theme before racing. No event triggers a fetch
   * or a decode of its own. */
  preload(): Promise<void> {
    if (this.loading) return this.loading;
    for (const theme of soundThemes)
      for (const event of theme.id === "vertigo" ? events : SAFETY_KIT)
        this.generate(theme, event);
    this.loading = this.load();
    return this.loading;
  }

  private async load() {
    try {
      const response = await fetch("/audio/manifest.json", {
        cache: "no-cache",
      });
      if (!response.ok) throw Error("Audio manifest unavailable");
      const manifest = (await response.json()) as BankManifest;
      await Promise.all(
        Object.entries(manifest.themes).map(([id, bank]) =>
          this.loadBank(id, bank, manifest.rate),
        ),
      );
    } catch (error) {
      this.fault = `Using procedural fallback: ${String(error)}`;
      for (const theme of soundThemes)
        for (const event of events)
          if (!this.buffers.has(SoundKit.key(theme.id, event)))
            this.generate(theme, event);
    }
    this.ready = true;
  }

  private async loadBank(
    id: string,
    bank: BankManifest["themes"][string],
    rate: number,
  ) {
    const response = await fetch(`/audio/${bank.file}?v=${bank.sha256}`);
    if (!response.ok) throw Error(`Audio bank ${id} unavailable`);
    const data = await response.arrayBuffer();
    if (data.byteLength !== bank.bytes) throw Error("Incomplete audio bank");
    const pcm = new DataView(data);
    for (const event of events)
      this.buffers.set(
        SoundKit.key(id, event),
        bank.entries[event].map((entry) => {
          const buffer = new AudioBuffer({
            numberOfChannels: 1,
            length: entry.length,
            sampleRate: rate,
          });
          decodeBankEntry(pcm, entry, buffer.getChannelData(0));
          return buffer;
        }),
      );
  }

  private generate(theme: SoundTheme, event: AudioEvent) {
    if (typeof AudioBuffer === "undefined") return;
    this.buffers.set(
      SoundKit.key(theme.id, event),
      Array.from({ length: recipes[event].variants }, (_, i) => {
        const data = synthesize(event, theme, i);
        const buffer = new AudioBuffer({
          numberOfChannels: 1,
          length: data.length,
          sampleRate: SAMPLE_RATE,
        });
        buffer.copyToChannel(new Float32Array(data), 0);
        return buffer;
      }),
    );
  }

  /** Variants for one event. A miss synthesises them, which is only needed
   * when an unusually early event precedes the background preload. */
  variants(theme: SoundTheme, event: AudioEvent) {
    const key = SoundKit.key(theme.id, event);
    if (!this.buffers.has(key)) this.generate(theme, event);
    return this.buffers.get(key);
  }
}
