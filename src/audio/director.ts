import { drivetrainTargets, ThrottleAttack } from "./drivetrain.ts";
import {
  eventGain,
  eventStrength,
  impactArticulation,
  lowestPriorityVoice,
  sameEventVictim,
} from "./event-policy.ts";
import { inKey, tunedDrivetrain } from "./harmony.ts";
import {
  buses,
  defaultMix,
  events,
  GRID,
  idleTelemetry,
  parseMix,
  recipes,
  Transport,
  vehicleParameters,
  type AudioEvent,
  type Bus,
  type Mix,
  type Telemetry,
} from "./model.ts";
import { SoundKit } from "./kit.ts";
import {
  noiseBuffer,
  noiseLayer,
  oscillatorLayer,
  stopLayer,
  type Layer,
} from "./layers.ts";
import { themeFor, type SoundTheme } from "./themes.ts";
export type EnvironmentAnchor = {
  id: string;
  position: number[];
  kind: "ventilation" | "hydraulic" | "relay";
  gain?: number;
};
type Voice = {
  id: number;
  event: AudioEvent;
  bus: Bus;
  priority: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner?: PannerNode;
  variant: number;
};
/** The sound director. It owns the audio graph, the voice pool and the
 * continuous layers, and it converts game events and vehicle telemetry into
 * sound. The game holds one director for the whole session. */
export class AudioDirector {
  ctx: AudioContext | null = null;
  theme: SoundTheme = themeFor("vertigo");
  transport = new Transport();
  mix: Mix = { ...defaultMix };
  muted = false;
  readonly maxVoices = 16;
  private kit = new SoundKit();
  private localFault = "";
  /** True once every theme holds a complete set of event buffers. */
  get ready() {
    return this.kit.ready;
  }
  /** A context fault is reported first, then a sound-kit fault. */
  get fault() {
    return this.localFault || this.kit.fault;
  }
  private nodes = {} as Record<Bus, GainNode>;
  private priorityNodes = {} as Record<Bus, GainNode>;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private meterData = new Float32Array(512);
  private peak = 0;
  private voices: Voice[] = [];
  private serial = 0;
  private variations = new Map<string, number>();
  private cooldown = new Map<string, number>();
  private busMutes = new Set<Bus>();
  private solo: Bus | null = null;
  private layers = {} as Record<string, Layer>;
  private noise: AudioBuffer | null = null;
  private anchors: EnvironmentAnchor[] = [];
  private machinery: {
    anchor: EnvironmentAnchor;
    layer: Layer;
    panner: PannerNode;
  }[] = [];
  private telemetry: Telemetry = { ...idleTelemetry };
  private override: Partial<Telemetry> | null = null;
  setTelemetryOverride(value: Partial<Telemetry> | null) {
    this.override = value;
  }
  private throttleAttack = new ThrottleAttack();
  private lastBar = -1;
  private contactResponseUntil = 0;
  private duckUntil = 0;
  private finishUntil = 0;
  private forcedPaused = false;
  private eventCounts: Partial<Record<AudioEvent, number>> = {};
  private recent: { event: AudioEvent; time: number }[] = [];
  private get key() {
    return this.theme.id;
  }
  get volume() {
    return this.mix.master;
  }
  set volume(v: number) {
    this.mix.master = Math.max(0, Math.min(1, v));
  }
  /** Load every sound theme once. Nothing is fetched during a run. */
  preload(): Promise<void> {
    return this.kit.preload();
  }

  init() {
    try {
      if (this.ctx) {
        if (this.ctx.state === "suspended")
          void this.ctx.resume().catch((e) => {
            this.localFault = String(e);
          });
        return;
      }
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      const c = this.ctx;
      this.transport = new Transport(c.currentTime);
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : this.mix.master;
      const high = c.createBiquadFilter();
      high.type = "highpass";
      high.frequency.value = 27;
      high.Q.value = 0.5;
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 5;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.08;
      this.analyser = c.createAnalyser();
      this.analyser.fftSize = 1024;
      this.master.connect(high);
      high.connect(limiter);
      limiter.connect(this.analyser);
      this.analyser.connect(c.destination);
      for (const bus of buses) {
        this.nodes[bus] = c.createGain();
        this.priorityNodes[bus] = c.createGain();
        this.nodes[bus].connect(this.priorityNodes[bus]);
        this.priorityNodes[bus].connect(this.master);
      }
      this.noise = noiseBuffer(c);
      this.layers.body = this.pitchedLayer("triangle", "vehicle", 180);
      this.layers.harmonic = this.pitchedLayer("sawtooth", "vehicle", 800);
      this.layers.overtone = this.pitchedLayer("sawtooth", "vehicle", 1100);
      this.layers.upper = this.pitchedLayer("sawtooth", "vehicle", 1400);
      this.layers.air = this.filteredNoise("vehicle", 2400, "highpass");
      this.layers.tire = this.pitchedLayer("triangle", "vehicle", 650, 0.12);
      this.layers.brake = this.pitchedLayer("triangle", "vehicle", 380, 0.32);
      this.layers.scrape = this.pitchedLayer("triangle", "vehicle", 620, 0.55);
      this.layers.whine = this.pitchedLayer("sine", "vehicle", 4000);
      this.layers.bed = this.pitchedLayer("sine", "environment", 130);
      this.layers.ambientAir = this.filteredNoise(
        "environment",
        700,
        "bandpass",
      );
      this.buildMachinery();
      this.syncMix();
      if (c.state === "suspended")
        void c.resume().catch((e) => {
          this.localFault = String(e);
        });
    } catch (error) {
      this.localFault = `Audio unavailable: ${String(error)}`;
    }
  }
  private pitchedLayer(
    type: OscillatorType,
    bus: Bus,
    cutoff: number,
    grit = 0,
  ): Layer {
    return oscillatorLayer(this.ctx!, this.nodes[bus], type, cutoff, grit);
  }

  private filteredNoise(
    bus: Bus,
    frequency: number,
    type: BiquadFilterType,
  ): Layer {
    return noiseLayer(this.ctx!, this.nodes[bus], this.noise, frequency, type);
  }

  setTheme(id: string) {
    if (this.theme.id === id) return;
    this.theme = themeFor(id);
    this.throttleAttack.reset();
    this.clearVoices();
    this.cooldown.clear();
    this.lastBar = -1;
  }
  setEnvironment(anchors: EnvironmentAnchor[]) {
    this.anchors = anchors;
    this.buildMachinery();
  }
  private buildMachinery() {
    if (!this.ctx) return;
    for (const m of this.machinery) {
      stopLayer(m.layer);
      m.panner.disconnect();
    }
    this.machinery = [];
    for (const anchor of this.anchors.slice(0, 4)) {
      const layer =
        anchor.kind === "ventilation"
          ? this.filteredNoise("environment", 600, "bandpass")
          : this.pitchedLayer("triangle", "environment", 260);
      const panner = this.ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 24;
      panner.maxDistance = 180;
      panner.rolloffFactor = 1.6;
      panner.positionX.value = anchor.position[0];
      panner.positionY.value = anchor.position[1];
      panner.positionZ.value = anchor.position[2];
      layer.gain.disconnect();
      layer.gain.connect(panner);
      panner.connect(this.nodes.environment);
      this.machinery.push({ anchor, layer, panner });
    }
  }
  setMix(value: unknown) {
    this.mix = parseMix(value);
    this.syncMix();
  }
  muteBus(bus: Bus, value: boolean) {
    if (value) this.busMutes.add(bus);
    else this.busMutes.delete(bus);
    this.syncMix();
  }
  soloBus(bus: Bus | null) {
    this.solo = bus;
    this.syncMix();
  }
  private syncMix() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(
      this.muted ? 0 : this.mix.master,
      t,
      0.015,
    );
    for (const bus of buses) {
      const value =
        bus === "environment"
          ? this.mix.ambience
          : bus === "ui" || bus === "gameplay"
            ? this.mix.sfx
            : this.mix[bus];
      this.nodes[bus].gain.setTargetAtTime(
        this.busMutes.has(bus) || (this.solo && this.solo !== bus) ? 0 : value,
        t,
        0.015,
      );
    }
  }
  emit(
    event: AudioEvent,
    options: { strength?: number; position?: number[]; at?: number } = {},
  ) {
    if (!this.ctx || !this.master || !recipes[event]) return;
    const now = this.ctx.currentTime,
      recipe = recipes[event];
    if (event === "race.restart" || event === "race.respawn") this.reset();
    if (event === "vehicle.boost.exit")
      for (const voice of [...this.voices])
        if (voice.event === "vehicle.boost.loop") this.stopVoice(voice);
    if (event === "vehicle.impact") this.contactResponseUntil = now + 0.09;
    if (now - (this.cooldown.get(event) ?? -100) < recipe.cooldown) return;
    this.cooldown.set(event, now);
    const same = sameEventVictim(this.voices, event);
    if (same) this.stopVoice(same);
    if (this.voices.length >= this.maxVoices) {
      const victim = lowestPriorityVoice(this.voices);
      if (victim.priority > recipe.priority) return;
      this.stopVoice(victim);
    }
    const variants = this.kit.variants(this.theme, event);
    if (!variants) return;
    const key = `${this.key}/${event}`;
    const index = this.variations.get(key) ?? 0;
    this.variations.set(key, index + 1);
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain();
    const strength = eventStrength(options.strength);
    const impact =
      event === "vehicle.impact" ? impactArticulation(strength) : null;
    const variant = impact ? impact.variant : index % variants.length;
    source.buffer = variants[variant];
    gain.gain.value = eventGain(
      event,
      strength,
      options.strength !== undefined,
    );
    const at = Math.max(now, options.at ?? now);
    let output: AudioNode = gain,
      panner: PannerNode | undefined;
    // Softer contacts are shorter and darker, not just quieter.
    if (event === "vehicle.land" || event === "vehicle.impact") {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = impact?.cutoff ?? 650 + strength * 5200;
      source.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(gain.gain.value, at);
      gain.gain.setTargetAtTime(
        0.00001,
        at + (impact?.hold ?? 0.025 + strength * 0.07),
        impact?.release ?? 0.025 + strength * 0.035,
      );
      source.onended = () => filter.disconnect();
    } else source.connect(gain);
    if (options.position) {
      panner = this.ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.refDistance = 12;
      panner.rolloffFactor = 1.6;
      panner.positionX.value = options.position[0];
      panner.positionY.value = options.position[1];
      panner.positionZ.value = options.position[2];
      gain.connect(panner);
      output = panner;
    }
    output.connect(this.nodes[recipe.bus]);
    const voice: Voice = {
      id: ++this.serial,
      event,
      bus: recipe.bus,
      priority: recipe.priority,
      source,
      gain,
      panner,
      variant,
    };
    const ended = source.onended;
    source.onended = (e) => {
      ended?.call(source, e);
      this.removeVoice(voice);
    };
    this.voices.push(voice);
    source.start(at);
    this.eventCounts[event] = (this.eventCounts[event] ?? 0) + 1;
    this.recent.push({ event, time: at });
    if (this.recent.length > 32) this.recent.shift();
    if (event === "vehicle.impact" && strength > 0.4)
      this.duckUntil = now + 0.15;
    if (event === "race.pb" || event === "race.finish")
      this.finishUntil = now + (event === "race.pb" ? GRID.bar : 0.4);
  }
  private removeVoice(voice: Voice) {
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.panner?.disconnect();
    this.voices = this.voices.filter((v) => v.id !== voice.id);
  }
  private stopVoice(voice: Voice) {
    voice.source.stop();
    this.removeVoice(voice);
  }
  private clearVoices() {
    for (const v of [...this.voices]) this.stopVoice(v);
  }
  pause(value: boolean) {
    this.forcedPaused = value;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [bus, gain] of [
      ["vehicle", value ? 0 : 1],
      ["gameplay", value ? 0.15 : 1],
      ["environment", value ? 0.1 : 1],
    ] as [Bus, number][]) {
      this.priorityNodes[bus].gain.cancelScheduledValues(t);
      this.priorityNodes[bus].gain.setTargetAtTime(gain, t, 0.01);
    }
    if (value)
      for (const voice of [...this.voices])
        if (
          voice.event === "vehicle.boost.loop" ||
          voice.event === "vehicle.scrape"
        )
          this.stopVoice(voice);
  }
  reset() {
    this.throttleAttack.reset();
    this.forcedPaused = false;
    this.clearVoices();
    this.cooldown.clear();
    this.contactResponseUntil = 0;
    this.duckUntil = 0;
    this.finishUntil = 0;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const layer of Object.values(this.layers)) {
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setValueAtTime(0, now);
    }
    for (const bus of buses) {
      this.priorityNodes[bus].gain.cancelScheduledValues(now);
      this.priorityNodes[bus].gain.setValueAtTime(1, now);
    }
    this.telemetry = { ...idleTelemetry };
  }
  /** Map one telemetry record onto the graph. Every value moves through a
   * time constant, so a sudden change of state cannot click. */
  update(telemetry: Telemetry) {
    if (this.override) telemetry = { ...telemetry, ...this.override };
    if (this.forcedPaused) telemetry = { ...telemetry, paused: true };
    this.telemetry = telemetry;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.syncMix();
    const p = vehicleParameters(telemetry);
    const tuned = this.theme.harmony
      ? tunedDrivetrain(this.theme.harmony)
      : undefined;
    const environment =
      (telemetry.active ? p.environment : 0.48) *
      (telemetry.paused ? 0.18 : 1) *
      (telemetry.finished ? 0.2 : 1);
    this.updateDrivetrain(telemetry, p, tuned, t);
    this.updateAmbience(telemetry, environment, tuned, t);
    this.moveListener(telemetry, t);
    this.updateMachinery(telemetry, p, environment, tuned, t);
  }

  /** Move one audio parameter towards a value. */
  private smooth(param: AudioParam, value: number, t: number, tau = 0.045) {
    param.setTargetAtTime(value, t, tau);
  }

  /** Set the gain, the pitch and the filter of one continuous layer. After a
   * contact the response is fast, so the tone follows the new speed at once. */
  private layer(
    name: string,
    t: number,
    gain: number,
    frequency?: number,
    filter?: number,
  ) {
    const l = this.layers[name];
    const response = t < this.contactResponseUntil ? 0.008 : 0.045;
    this.smooth(l.gain.gain, gain, t, response);
    if (frequency !== undefined && l.osc)
      this.smooth(l.osc.frequency, frequency, t, 0.07);
    if (filter !== undefined)
      this.smooth(l.filter.frequency, filter, t, response);
  }

  /** Engine body, harmonics, air, tires, scraping and the airborne whine. */
  private updateDrivetrain(
    telemetry: Telemetry,
    p: ReturnType<typeof vehicleParameters>,
    tuned: ReturnType<typeof tunedDrivetrain> | undefined,
    t: number,
  ) {
    const active = telemetry.active && !telemetry.paused ? 1 : 0;
    const finished = telemetry.finished ? 0.42 : 1;
    const attack = this.throttleAttack.update(active ? p.throttle : 0, t);
    const motor = drivetrainTargets(p, attack, telemetry.scrape);
    const layer = (
      name: string,
      gain: number,
      frequency?: number,
      filter?: number,
    ) => this.layer(name, t, gain, frequency, filter);
    const smooth = (param: AudioParam, value: number, tau = 0.045) =>
      this.smooth(param, value, t, tau);
    layer(
      "body",
      active * finished * (tuned ? motor.body : p.body),
      tuned?.body ?? this.theme.fieldTimbre.fundamental + p.rpm / 95,
      tuned ? 85 + p.load * 25 : 170 + p.load * 80,
    );
    for (const name of ["harmonic", "overtone", "upper"])
      smooth(
        this.layers[name].drive!.gain,
        tuned
          ? motor.drive
          : this.theme.fieldTimbre.drive * (1 + p.throttle * 0.4),
      );
    layer(
      "harmonic",
      active * finished * (tuned ? motor.harmonic : p.harmonic),
      tuned?.harmonic ??
        (this.theme.fieldTimbre.fundamental + p.rpm / 95) * 2.01,
      tuned ? motor.cutoff : 260 + p.throttle * 900 + p.load * 600,
    );
    layer(
      "overtone",
      tuned ? active * finished * motor.overtone : 0,
      tuned ? tuned.harmonic * 2 : 200,
      motor.cutoff * 1.15,
    );
    layer(
      "upper",
      tuned ? active * finished * motor.upper : 0,
      tuned ? tuned.harmonic * 4 : 400,
      motor.cutoff * 1.3,
    );
    layer(
      "air",
      active * p.air * (tuned ? 0 : 1),
      undefined,
      (tuned ? 2000 : 1300) + p.speed * 48,
    );
    const root = this.theme.fieldTimbre.fundamental;
    const pitch = (hz: number) =>
      this.theme.harmony ? inKey(hz, this.theme.harmony) : hz;
    layer(
      "tire",
      active * finished * p.tire * 0.42,
      pitch(root * (3 + p.slip)),
      420 + p.slip * 580,
    );
    smooth(this.layers.tire.filter.Q, 0.65);
    layer(
      "brake",
      active * finished * p.brake * 0.34,
      pitch(root * (1.5 + Math.min(1, p.speed / 70))),
      230 + Math.min(1, p.speed / 70) * 250,
    );
    smooth(this.layers.brake.filter.Q, 0.55);
    // Soft pedal onset and release; no retriggers or airborne tire tone.
    smooth(
      this.layers.brake.gain.gain,
      active * finished * p.brake * 0.34,
      p.brake > 0 ? 0.018 : 0.065,
    );
    layer(
      "scrape",
      active * finished * p.scrape * 0.45,
      pitch(root * (2.5 + Math.min(1, p.speed / 70) * 0.5)),
      350 + Math.min(1, p.speed / 70) * 450,
    );
    if (!telemetry.scrape || !telemetry.grounded || p.speed < 0.1)
      smooth(this.layers.scrape.gain.gain, 0, 0.008);
    if (!telemetry.grounded) {
      smooth(this.layers.tire.gain.gain, 0, 0.008);
      smooth(this.layers.brake.gain.gain, 0, 0.008);
    }
    layer(
      "whine",
      active * (tuned || telemetry.grounded ? 0 : 0.004 + p.throttle * 0.003),
      650 + p.rpm * 0.24,
      3800,
    );
  }

  /** The environment bed, the filtered air and the bus priorities. */
  private updateAmbience(
    telemetry: Telemetry,
    environment: number,
    tuned: ReturnType<typeof tunedDrivetrain> | undefined,
    t: number,
  ) {
    const layer = (
      name: string,
      gain: number,
      frequency?: number,
      filter?: number,
    ) => this.layer(name, t, gain, frequency, filter);
    const smooth = (param: AudioParam, value: number, tau = 0.045) =>
      this.smooth(param, value, t, tau);
    layer(
      "bed",
      0.0035 * environment * this.theme.ambienceProfile.density,
      this.theme.ambienceProfile.bed,
    );
    layer(
      "ambientAir",
      0.002 *
        environment *
        this.theme.ambienceProfile.density *
        (tuned ? 0 : 1),
      undefined,
      this.theme.ambienceProfile.air,
    );
    smooth(
      this.priorityNodes.environment.gain,
      (telemetry.paused ? 0.1 : 1) *
        (t < this.duckUntil ? 0.3 : 1) *
        (t < this.finishUntil ? 0.35 : 1),
      0.015,
    );
    smooth(
      this.priorityNodes.vehicle.gain,
      (telemetry.paused ? 0 : 1) * (t < this.finishUntil ? 0.45 : 1),
      0.02,
    );
    smooth(
      this.priorityNodes.gameplay.gain,
      telemetry.paused ? 0.15 : 1,
      0.015,
    );
  }

  /** Place the listener at the car. */
  private moveListener(telemetry: Telemetry, t: number) {
    const smooth = (param: AudioParam, value: number, tau = 0.045) =>
      this.smooth(param, value, t, tau);
    const listener = this.ctx!.listener;
    for (const [params, values] of [
      [
        [listener.positionX, listener.positionY, listener.positionZ],
        telemetry.position,
      ],
      [
        [listener.forwardX, listener.forwardY, listener.forwardZ],
        telemetry.heading,
      ],
      [[listener.upX, listener.upY, listener.upZ], telemetry.up],
    ] as [AudioParam[], number[]][]) {
      params.forEach((param, i) => smooth(param, values[i] ?? 0, 0.025));
    }
  }

  /** Level and tune the spatial infrastructure sources, and fire the rare
   * machinery pulse on a bar boundary. */
  private updateMachinery(
    telemetry: Telemetry,
    p: ReturnType<typeof vehicleParameters>,
    environment: number,
    tuned: ReturnType<typeof tunedDrivetrain> | undefined,
    t: number,
  ) {
    const smooth = (param: AudioParam, value: number, tau = 0.045) =>
      this.smooth(param, value, t, tau);
    for (const m of this.machinery) {
      smooth(
        m.layer.gain.gain,
        this.key === "vertigo"
          ? environment *
              (m.anchor.gain ?? 0.018) *
              (m.anchor.kind === "ventilation" ? 0.08 : 1)
          : 0,
        0.08,
      );
      if (m.layer.osc)
        smooth(
          m.layer.osc.frequency,
          tuned?.machinery ?? this.theme.ambienceProfile.bed * 1.5,
        );
    }
    const bar = this.transport.phase(t).bar;
    if (bar !== this.lastBar) {
      this.lastBar = bar;
      if (
        bar > 0 &&
        bar % this.theme.ambienceProfile.bars === 0 &&
        !telemetry.paused &&
        p.speed < 55 &&
        this.key === "vertigo" &&
        this.anchors.length
      ) {
        const anchor =
          this.anchors[
            ((bar / this.theme.ambienceProfile.bars) % this.anchors.length) | 0
          ];
        // Only an actual nearby infrastructure source may sound; no phantom distant beat.
        if (
          Math.hypot(
            ...anchor.position.map((v, i) => v - telemetry.position[i]),
          ) < 120
        )
          this.emit("environment.pulse", {
            position: anchor.position,
            strength: 0.25,
          });
      }
    }
  }
  get diagnostics() {
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(this.meterData);
      this.peak = Math.max(...this.meterData.map(Math.abs));
    }
    return {
      ready: this.ready,
      context: this.ctx?.state ?? "locked",
      theme: this.key,
      harmony: this.theme.harmony?.name ?? null,
      tonalLayers: Object.fromEntries(
        Object.entries(this.layers)
          .filter(([, l]) => l.osc)
          .map(([name, l]) => [name, l.osc!.frequency.value]),
      ),
      voices: this.voices.length,
      continuousLayers: Object.entries(this.layers)
        .filter(([, l]) => l.gain.gain.value > 0.0002)
        .map(([name]) => name),
      layerLevels: Object.fromEntries(
        Object.entries(this.layers).map(([name, l]) => [
          name,
          l.gain.gain.value,
        ]),
      ),
      layerFilters: Object.fromEntries(
        Object.entries(this.layers).map(([name, l]) => [
          name,
          l.filter.frequency.value,
        ]),
      ),
      layerDrives: Object.fromEntries(
        Object.entries(this.layers)
          .filter(([, l]) => l.drive)
          .map(([name, l]) => [name, l.drive!.gain.value]),
      ),
      drivetrain: drivetrainTargets(
        vehicleParameters(this.telemetry),
        0,
        this.telemetry.scrape,
      ),
      allocatedContinuous:
        Object.keys(this.layers).length + this.machinery.length,
      paused: this.forcedPaused,
      worldGain: this.priorityNodes.vehicle?.gain.value ?? 0,
      voiceEvents: this.voices.map((v) => v.event),
      voiceVariants: this.voices.map((v) => ({
        event: v.event,
        variant: v.variant,
      })),
      maxVoices: this.maxVoices,
      masterPeak: this.peak,
      masterDb: this.peak > 0 ? 20 * Math.log10(this.peak) : -120,
      transport: this.transport.phase(this.ctx?.currentTime ?? 0),
      baseLatency: this.ctx?.baseLatency ?? 0,
      outputLatency: this.ctx?.outputLatency ?? 0,
      params: vehicleParameters(this.telemetry),
      mix: { ...this.mix },
      muted: this.muted,
      mutes: [...this.busMutes],
      solo: this.solo,
      events: { ...this.eventCounts },
      recent: [...this.recent],
      fault: this.fault,
      anchors: this.anchors.length,
    };
  }
  /** Explicit dev-only capture; records generated output, never a microphone. */
  recordingDestination() {
    if (!this.ctx || !this.analyser) return null;
    const destination = this.ctx.createMediaStreamDestination();
    this.analyser.connect(destination);
    return {
      stream: destination.stream,
      disconnect: () => {
        this.analyser?.disconnect(destination);
        destination.stream.getTracks().forEach((t) => t.stop());
      },
    };
  }
  dispose() {
    this.reset();
    for (const layer of Object.values(this.layers)) stopLayer(layer);
    for (const m of this.machinery) {
      stopLayer(m.layer);
      m.panner.disconnect();
    }
    void this.ctx?.close();
    this.ctx = null;
  }
}
