import { SAMPLE_RATE } from "../../src/audio/synthesis.ts";

export function createMonoWav(length: number, bits: 16 | 24) {
  const bytes = bits / 8;
  const out = Buffer.alloc(44 + length * bytes);
  out.write("RIFF");
  out.writeUInt32LE(out.length - 8, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(SAMPLE_RATE, 24);
  out.writeUInt32LE(SAMPLE_RATE * bytes, 28);
  out.writeUInt16LE(bytes, 32);
  out.writeUInt16LE(bits, 34);
  out.write("data", 36);
  out.writeUInt32LE(length * bytes, 40);
  return out;
}

export function encodeMasterWav(data: Float32Array) {
  const out = createMonoWav(data.length, 24);
  for (let i = 0; i < data.length; i++)
    out.writeIntLE(
      Math.round(Math.max(-1, Math.min(1, data[i])) * 8388607),
      44 + i * 3,
      3,
    );
  return out;
}

export function encodeBankPcm(data: Float32Array) {
  const pcm = Buffer.alloc(data.length * 2);
  for (let i = 0; i < data.length; i++)
    pcm.writeInt16LE(Math.round(data[i] * 32767), i * 2);
  return pcm;
}
