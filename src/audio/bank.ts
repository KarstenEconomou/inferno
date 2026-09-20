/** Layout of the pre-rendered sound bank. One binary file per theme holds
 * every event variant as 16-bit mono samples; the manifest gives the offset
 * and the length of each one. */
import type { AudioEvent } from "./model.ts";

export type BankEntry = { offset: number; length: number };
export type BankManifest = {
  rate: number;
  themes: Record<
    string,
    {
      file: string;
      bytes: number;
      sha256: string;
      entries: Record<AudioEvent, BankEntry[]>;
    }
  >;
};

export function decodeBankEntry(
  pcm: DataView,
  entry: BankEntry,
  channel: Float32Array,
) {
  for (let i = 0; i < entry.length; i++)
    channel[i] = pcm.getInt16((entry.offset + i) * 2, true) / 32768;
}
