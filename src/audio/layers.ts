import { random, SAMPLE_RATE } from "./synthesis.ts";

/** One continuous voice of the vehicle or the environment. Layers run for the
 * whole session; only their gain and filter move. */
export type Layer = {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  osc?: OscillatorNode;
  drive?: GainNode;
  shaper?: WaveShaperNode;
};

/** Two seconds of looped noise. The two channels use different seeds, so the
 * loop has no audible centre image. */
export function noiseBuffer(ctx: BaseAudioContext) {
  const buffer = ctx.createBuffer(2, SAMPLE_RATE * 2, SAMPLE_RATE);
  for (let channel = 0; channel < 2; channel++) {
    const next = random(0x1984 + channel * 301);
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] = next() * 0.6;
  }
  return buffer;
}

function tanhCurve(length: number, amount: number) {
  const curve = new Float32Array(length);
  for (let i = 0; i < curve.length; i++)
    curve[i] = Math.tanh(((i / (length - 1)) * 2 - 1) * amount) / amount;
  return curve;
}

/** A small cubic residual adds harmonic grain. Subtracting 0.6x keeps the
 * root mean square of a triangle wave nearly constant. */
function gritCurve(length: number, grit: number) {
  const curve = new Float32Array(length);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (length - 1)) * 2 - 1;
    curve[i] = x + grit * (x * x * x - 0.6 * x);
  }
  return curve;
}

/** Pitched layer. A sawtooth gets a drive stage and soft clipping; other
 * shapes can take a small amount of grit instead. */
export function oscillatorLayer(
  ctx: AudioContext,
  destination: AudioNode,
  type: OscillatorType,
  cutoff: number,
  grit = 0,
): Layer {
  const source = ctx.createOscillator(),
    filter = ctx.createBiquadFilter(),
    gain = ctx.createGain();
  source.type = type;
  source.frequency.value = 48;
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  filter.Q.value = 0.6;
  gain.gain.value = 0;
  source.connect(filter);
  let drive: GainNode | undefined, shaper: WaveShaperNode | undefined;
  if (type === "sawtooth") {
    drive = ctx.createGain();
    shaper = ctx.createWaveShaper();
    shaper.curve = tanhCurve(1024, 1.7);
    shaper.oversample = "2x";
    filter.connect(drive);
    drive.connect(shaper);
    shaper.connect(gain);
  } else if (grit > 0) {
    shaper = ctx.createWaveShaper();
    shaper.curve = gritCurve(2049, grit);
    shaper.oversample = "2x";
    filter.connect(shaper);
    shaper.connect(gain);
  } else filter.connect(gain);
  gain.connect(destination);
  source.start();
  return { source, osc: source, filter, gain, drive, shaper };
}

/** Filtered noise layer, for air and ambience. */
export function noiseLayer(
  ctx: AudioContext,
  destination: AudioNode,
  noise: AudioBuffer | null,
  frequency: number,
  type: BiquadFilterType,
): Layer {
  const source = ctx.createBufferSource(),
    filter = ctx.createBiquadFilter(),
    gain = ctx.createGain();
  source.buffer = noise;
  source.loop = true;
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = 0.8;
  gain.gain.value = 0;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start();
  return { source, filter, gain };
}

/** Stop a layer and release every node it owns. */
export function stopLayer(layer: Layer) {
  layer.source.stop();
  layer.source.disconnect();
  layer.filter.disconnect();
  layer.gain.disconnect();
  layer.drive?.disconnect();
  layer.shaper?.disconnect();
}
