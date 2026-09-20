import { Vector3 } from "three";
import { Sound } from "../audio";
import { orientation, CAMERA_NAMES } from "../render/camera";
import { World } from "../render/world";
import {
  DrivingFeedback,
  HANDLING,
  Race,
  STEP,
  Vehicle,
  type Input,
  type RecordRun,
} from "../sim";
import {
  courseFor,
  frame,
  point,
  roadWidth,
  track,
  TRACK_VERSION,
} from "../track";
import {
  applyTheme,
  circuits,
  defaultPad,
  defaults,
  delta,
  format,
  keyName,
  padName,
  sectors,
  type Action,
  type HistoryEntry,
} from "../ui";
import { diagnostics } from "./diagnostics";
import { HUD } from "./hud";
import { GamepadSource } from "./input/gamepad";
import { Keyboard, type DriveAxes } from "./input/keyboard";
import { attachInput, pollGamepad } from "./input/router";
import { Minimap } from "./minimap";
import { showPause } from "./screens/pause";
import { showRecords } from "./screens/records";
import { showResults } from "./screens/results";
import { SETTINGS_CATEGORIES, showSettings } from "./screens/settings";
import { showTitle } from "./screens/title";
import { selectCircuit, showTrackSelect } from "./screens/tracks";
import {
  loadRecords,
  loadSession,
  saveBest,
  saveHistory,
  savePreferences,
  type Preferences,
} from "./storage";

export type Screen = "title" | "tracks" | "records" | "drive";
export type RunState = "title" | "ready" | "racing" | "paused" | "finished";

/** Longest render step that the simulation accepts. A longer gap, such as a
 * background tab, is discarded instead of being simulated in one jump. */
const MAX_FRAME = 0.1;
/** Distance from the road at which an airborne car is declared lost. */
const LOST_DISTANCE = 65;
/** Height below which any car is declared lost. */
const LOST_HEIGHT = -80;
/** Number of recent frame times that the frame-time report uses. */
const FRAME_SAMPLES = 300;

/** Race flow, persistence and the frame loop. The game owns the simulation,
 * the renderer and the sound director, and passes each of them the state that
 * it needs. Screens and input routing read this object; they hold no state. */
export class Game {
  readonly car = new Vehicle();
  race = new Race(this.car);
  readonly feedback = new DrivingFeedback();
  readonly sound = new Sound();
  minimap = new Minimap();
  private plans = new Map<string, Minimap>();
  readonly hud = new HUD();
  readonly pad = new GamepadSource();
  readonly keyboard: Keyboard;
  prefs: Preferences;
  best: RecordRun | null;
  history: HistoryEntry[];
  saveWarning: boolean;

  screen: Screen = "title";
  state: RunState = "title";
  private previousState: RunState = "ready";
  selectedCircuit = 0;
  runs = 0;
  hudVisible = true;
  inputDevice: "keyboard" | "controller" = "keyboard";
  sessionBest: number | null = null;
  result: { previous: RecordRun | null; isBest: boolean } | null = null;
  captureBinding: Action | null = null;
  capturePad: Action | null = null;
  padDrive: DriveAxes = { throttle: 0, brake: false, steer: 0 };
  learnedLessons: Set<string>;
  ghostIndex = 0;

  /** The open page of the settings book, and where it was opened from. */
  settingsCategory = SETTINGS_CATEGORIES[0];
  settingsPage = false;

  private settingsOpener: HTMLElement | null = null;
  private accumulator = 0;
  private last = performance.now();
  private ghostOpacityApplied = -1;
  private totalFrames = 0;
  private frameSeconds = 0;
  private frameTimes = new Float32Array(FRAME_SAMPLES);
  private frameCursor = 0;
  private frameCount = 0;
  private previousPose = {
    position: new Vector3(),
    heading: new Vector3(),
    up: new Vector3(),
    steeringAngle: 0,
  };
  private renderPose = {
    position: new Vector3(),
    heading: new Vector3(),
    up: new Vector3(),
    steeringAngle: 0,
    resetSerial: 0,
    speed: 0,
    boost: 0,
    grounded: true,
    suspension: 0,
    velocity: new Vector3(),
    slipIntensity: 0,
    slipAngle: 0,
  };
  private telemetry = {
    speed: 0,
    forward: 0,
    throttle: 0,
    brake: false,
    poweredDrift: false,
    slip: 0,
    grounded: true,
    boost: false,
    scrape: false,
    active: false,
    paused: false,
    finished: false,
    position: [0, 0, 0],
    heading: [0, 0, 0],
    up: [0, 0, 0],
  };

  constructor(
    readonly ui: HTMLElement,
    readonly world: World,
  ) {
    const session = loadSession();
    this.prefs = session.preferences;
    this.best = session.best;
    this.history = session.history;
    this.saveWarning = session.unavailable;
    this.learnedLessons = new Set(this.prefs.guide.lessons);
    this.keyboard = new Keyboard(this.prefs.bindings);
    this.world.cameraController.settings = this.prefs.camera;
    this.world.cameraMode = this.prefs.camera.preset;
    this.sound.muted = this.prefs.muted;
    if (this.prefs.volume !== null) this.sound.volume = this.prefs.volume;
    if (this.prefs.audioMix) this.sound.setMix(this.prefs.audioMix);
    void this.sound.preload();
    this.sound.setEnvironment(this.environmentAnchors());
    attachInput(this);
  }

  /** Place one spatial sound source beside each landmark sequence. */
  private environmentAnchors() {
    const kinds = ["relay", "ventilation", "hydraulic"] as const;
    return (track.landmarks ?? []).map((landmark, i) => {
      const f = frame(landmark.start);
      return {
        id: landmark.kind,
        position: f.p
          .clone()
          .addScaledVector(f.right, roadWidth(landmark.start) / 2 + 8)
          .addScaledVector(f.up, 8)
          .toArray(),
        kind: kinds[Math.min(i, kinds.length - 1)],
        gain: 0.026,
      };
    });
  }

  // --- presentation helpers -------------------------------------------------

  /** Binding label for the device that the player last used. */
  bindingLabel(action: Action) {
    return this.inputDevice === "controller"
      ? padName(this.prefs.padBindings, action)
      : keyName(this.prefs.bindings[action]);
  }

  /** Publish the inks and the sound kit of the selected circuit. This is the
   * cheap half: it runs whenever the cursor moves down the circuit list. */
  applyCircuitTheme() {
    applyTheme(circuits[this.selectedCircuit].theme);
    this.sound.setTheme(
      circuits[this.selectedCircuit].audioTheme ??
        circuits[this.selectedCircuit].id,
    );
  }

  /** Id of the circuit whose course is built. The selection sheet only
   * reports a best lap for this one. */
  get loadedCircuit() {
    return circuits.find((c) => track.id.startsWith(c.id))?.id ?? "";
  }

  /** Plan of any authored circuit, for the selection sheet. Each one is
   * drawn once and kept. */
  planOf(id: string) {
    let plan = this.plans.get(id);
    if (!plan) this.plans.set(id, (plan = new Minimap(courseFor(id))));
    return plan;
  }

  /** Build the selected circuit: its course, its world, its plan and its
   * records. This is the expensive half, so it runs when a run begins and
   * never while the cursor is moving. */
  loadCircuit() {
    const circuit = circuits[this.selectedCircuit];
    if (!circuit.available || track.id.startsWith(circuit.id)) return;
    this.world.loadCircuit(circuit);
    this.minimap = this.planOf(circuit.id);
    // The ghost is rebuilt with the world, so its opacity is applied again.
    this.ghostOpacityApplied = -1;
    const records = loadRecords();
    this.best = records.best;
    this.history = records.history;
    this.sessionBest = null;
    this.learnedLessons = new Set(
      this.prefs.guide.version === track.id ? this.prefs.guide.lessons : [],
    );
    this.prefs.guide.version = track.id;
    this.sound.setEnvironment(this.environmentAnchors());
    this.car.reset(0);
    this.race = new Race(this.car);
  }

  /** Apply the current head-up display preferences. */
  applyHUD() {
    this.hud.apply({
      prefs: this.prefs.hud,
      visible: this.hudVisible,
    });
  }

  // --- persistence ----------------------------------------------------------

  /** Save the preferences, including the values that the services own. */
  saveSettings() {
    this.prefs.camera = this.world.cameraController.settings;
    this.prefs.muted = this.sound.muted;
    this.prefs.volume = this.sound.volume;
    this.prefs.audioMix = this.sound.mix;
    this.prefs.guide.version = track.id;
    this.prefs.guide.lessons = [...this.learnedLessons];
    if (!savePreferences(this.prefs, track.id)) this.saveWarning = true;
  }

  resetBindings() {
    this.prefs.bindings = { ...defaults };
    this.prefs.padBindings = { ...defaultPad };
    this.keyboard.rebound(this.prefs.bindings);
    this.saveSettings();
  }

  // --- screens --------------------------------------------------------------

  title() {
    this.sound.reset();
    this.captureBinding = null;
    this.capturePad = null;
    this.state = "title";
    this.screen = "title";
    this.selectedCircuit = 0;
    this.applyCircuitTheme();
    this.loadCircuit();
    this.keyboard.clear();
    this.car.reset(0);
    this.snapshot();
    this.world.trails.clear();
    this.feedback.reset();
    this.world.resetCamera(this.car);
    this.world.ghost.visible = false;
    showTitle(this);
  }

  trackSelect() {
    this.sound.reset();
    this.state = "title";
    this.screen = "tracks";
    this.applyCircuitTheme();
    showTrackSelect(this);
  }

  records() {
    this.screen = "records";
    showRecords(this);
  }

  selectCircuit(index: number) {
    selectCircuit(this, index);
  }

  /** Open the pause panel and hold the run. */
  pause() {
    this.sound.pause(true);
    this.sound.emit("ui.panel");
    if (this.state !== "paused") {
      this.previousState = this.state;
      this.state = "paused";
      this.sound.pause(true);
      this.keyboard.clear();
    }
    showPause(this);
  }

  /** Open the settings book, from the title screen or from a held run. */
  settings(
    fromTitle = false,
    category = SETTINGS_CATEGORIES[0],
    focusSelector?: string,
  ) {
    this.captureBinding = null;
    this.capturePad = null;
    if (!document.querySelector("#settings-overlay"))
      this.settingsOpener = document.activeElement as HTMLElement | null;
    if (!fromTitle && this.state !== "paused") {
      this.previousState = this.state;
      this.state = "paused";
      this.sound.pause(true);
      this.keyboard.clear();
    }
    this.settingsPage = fromTitle;
    this.settingsCategory = category;
    showSettings(this, fromTitle, category, focusSelector);
  }

  /** Turn one page of the settings book, the way a shoulder button does. */
  pageSettings(step: number) {
    const count = SETTINGS_CATEGORIES.length;
    const index = SETTINGS_CATEGORIES.indexOf(this.settingsCategory);
    this.sound.emit("ui.move");
    this.settings(
      this.settingsPage,
      SETTINGS_CATEGORIES[(index + step + count) % count],
    );
  }

  /** Close the pause or settings panel and return to the held state. */
  closeSettings() {
    this.sound.pause(false);
    this.sound.emit("ui.back");
    document.querySelector("#settings-overlay")?.remove();
    this.captureBinding = null;
    this.capturePad = null;
    this.keyboard.clear();
    if (this.state === "paused") this.state = this.previousState;
    if (this.settingsOpener?.isConnected)
      this.settingsOpener.focus({ preventScroll: true });
    this.settingsOpener = null;
    this.applyHUD();
  }

  expandedResults() {
    this.sound.emit("ui.panel");
    showResults(this);
  }

  // --- race flow ------------------------------------------------------------

  /** Begin a run on the ready grid. Holding the throttle starts the clock. */
  start(preserveInput = false) {
    this.applyCircuitTheme();
    this.loadCircuit();
    this.screen = "drive";
    this.runs++;
    this.result = null;
    this.world.cameraMode = this.world.cameraController.settings.preset;
    this.hudVisible = true;
    this.sound.init();
    this.sound.emit("race.restart");
    if (!preserveInput) this.keyboard.clear();
    this.car.reset(0);
    this.world.trails.clear();
    this.feedback.reset();
    this.snapshot();
    this.race = new Race(this.car);
    this.ghostIndex = 0;
    this.accumulator = 0;
    this.world.resetCamera(this.car);
    this.world.ghost.visible = false;
    this.hud.mount(this.ui, this.minimap);
    this.applyHUD();
    this.state = "ready";
  }

  private launch() {
    this.state = "racing";
    this.sound.emit("race.start");
  }

  /** Close a completed run: keep the record, the history and the ghost. */
  private finish() {
    this.state = "finished";
    const previous = this.best;
    const isBest = !this.best || this.race.time < this.best.time;
    this.sound.emit(isBest ? "race.pb" : "race.finish");
    if (isBest) {
      this.best = {
        version: TRACK_VERSION,
        time: this.race.time,
        splits: [...this.race.splits],
        poses: this.race.poses,
      };
      if (!saveBest(this.best)) this.saveWarning = true;
    }
    this.result = { previous, isBest };
    this.sessionBest = Math.min(this.sessionBest ?? Infinity, this.race.time);
    this.history.push({
      date: new Date().toISOString().slice(0, 10),
      time: this.race.time,
      sectors: sectors(this.race.splits, this.race.time),
    });
    this.history = this.history.slice(-50);
    if (!saveHistory(this.history)) this.saveWarning = true;
    this.hud.showSplit(
      previous ? delta(this.race.time - previous.time) : "—",
      this.prefs.hud.splits,
    );
  }

  /** Respawn at the last checkpoint. The clock keeps running. */
  private respawn(announce = true) {
    if (announce) this.sound.emit("race.respawn");
    this.race.respawn(this.car);
    this.world.trails.clear();
    this.feedback.reset();
    this.snapshot();
    this.world.resetCamera(this.car);
  }

  /** True when the car left the course and cannot recover on its own. */
  private lost() {
    return (
      this.car.needsRespawn ||
      (!this.car.grounded &&
        this.car.position.distanceTo(point(this.car.progress)) >
          LOST_DISTANCE) ||
      this.car.position.y < LOST_HEIGHT
    );
  }

  /** Run one player action, whatever device asked for it. */
  action(a: Action) {
    if (a === "restart" && this.state !== "title") {
      this.prefs.familiar++;
      this.saveSettings();
      this.start(this.state !== "paused");
      return;
    }
    if (a === "menu") {
      if (document.querySelector("#settings-overlay")) this.closeSettings();
      else if (this.state === "finished") this.trackSelect();
      else if (this.state === "title") this.title();
      else this.pause();
      return;
    }
    if (a === "confirm") {
      if (this.state === "finished") this.expandedResults();
      else if (
        this.state === "title" &&
        this.screen === "tracks" &&
        circuits[this.selectedCircuit].available
      )
        this.start();
      else if (this.state === "title" && this.screen === "tracks")
        this.sound.emit("ui.denied");
      else if (this.state === "title" && this.screen === "title")
        this.trackSelect();
    }
    if (!["racing", "ready", "finished"].includes(this.state)) return;
    if (a === "ghost") {
      this.prefs.ghost = !this.prefs.ghost;
      this.prefs.familiar++;
      this.saveSettings();
      this.applyHUD();
    }
    if (
      a === "camera" ||
      a === "camera1" ||
      a === "camera2" ||
      a === "camera3"
    ) {
      this.world.cameraMode =
        a === "camera"
          ? (this.world.cameraMode + 1) % CAMERA_NAMES.length
          : Number(a.slice(-1)) - 1;
      this.world.cameraController.settings.preset = this.world.cameraMode;
      this.saveSettings();
      this.world.resetCamera(this.car);
    }
    if (a === "splits") {
      this.prefs.hud.splits = !this.prefs.hud.splits;
      this.saveSettings();
      this.applyHUD();
    }
    if (a === "hud") {
      this.hudVisible = !this.hudVisible;
      this.applyHUD();
    }
    if (a === "respawn" && this.state === "racing") this.respawn();
  }

  /** Losing the window stops driving input and holds an active run. */
  loseFocus() {
    this.keyboard.clear();
    if (["racing", "ready"].includes(this.state)) this.pause();
  }

  // --- frame loop -----------------------------------------------------------

  private snapshot() {
    this.previousPose.position.copy(this.car.position);
    this.previousPose.heading.copy(this.car.heading);
    this.previousPose.up.copy(this.car.up);
    this.previousPose.steeringAngle = this.car.steeringAngle;
  }

  get frameRate() {
    return this.totalFrames / Math.max(0.001, this.frameSeconds);
  }

  /** Frame time that 95 percent of recent racing frames stayed below. */
  get frameMsP95() {
    if (!this.frameCount) return 0;
    const recent = [...this.frameTimes.slice(0, this.frameCount)].sort(
      (a, b) => a - b,
    );
    return recent[Math.floor((this.frameCount - 1) * 0.95)];
  }

  get diagnostics() {
    return diagnostics(this);
  }

  /** Advance the simulation by fixed steps while the clock runs. */
  private advanceRace(input: Input, dt: number) {
    this.accumulator += dt;
    while (this.accumulator >= STEP && this.state === "racing") {
      this.snapshot();
      const previousCheckpoint = this.race.nextCheckpoint,
        previousBoost = this.car.boost,
        wasGrounded = this.car.grounded;
      this.car.step(input);
      this.world.updateCamera(this.car, STEP);
      this.world.trails.update(this.car, STEP);
      this.feedback.update(this.car, input, STEP);
      if (wasGrounded && !this.car.grounded) this.sound.emit("vehicle.jump");
      if (!wasGrounded && this.car.grounded)
        this.sound.emit("vehicle.land", { strength: this.car.landingImpact });
      if (this.car.railImpact > 0.12)
        this.sound.emit("vehicle.impact", { strength: this.car.railImpact });
      this.race.update(this.car, STEP);
      if (previousCheckpoint !== this.race.nextCheckpoint) this.announceSplit();
      this.recordLesson();
      if (this.car.boost > previousBoost)
        this.sound.emit("vehicle.boost.enter");
      else if (previousBoost > 0 && this.car.boost === 0)
        this.sound.emit("vehicle.boost.exit");
      if (this.lost()) this.respawn();
      if (this.race.finished) this.finish();
      this.accumulator -= STEP;
    }
  }

  /** The record ends at the line. The car stays driveable until the result. */
  private advanceFreeDrive(input: Input, dt: number) {
    this.accumulator += dt;
    while (this.accumulator >= STEP) {
      this.snapshot();
      this.car.step(input);
      this.world.updateCamera(this.car, STEP);
      this.world.trails.update(this.car, STEP);
      this.accumulator -= STEP;
      if (this.lost()) {
        this.car.reset(0);
        this.snapshot();
        this.world.trails.clear();
        this.world.resetCamera(this.car);
      }
    }
  }

  private announceSplit() {
    const split = this.race.splits.at(-1)!;
    const gap = this.best
      ? split - this.best.splits[this.race.nextCheckpoint - 1]
      : null;
    const detail =
      gap === null || !this.prefs.hud.delta ? format(split) : delta(gap);
    this.hud.showSplit(detail, this.prefs.hud.splits);
    this.sound.emit(
      gap === null || Math.abs(gap) < 0.005
        ? "checkpoint.hit"
        : gap < 0
          ? "checkpoint.ahead"
          : "checkpoint.behind",
    );
  }

  /** Record course milestones without interrupting the driving view. */
  private recordLesson() {
    const lesson = track.lessons?.find(
      (l) =>
        this.car.progress >= l.start &&
        this.car.progress < l.end &&
        !this.learnedLessons.has(l.id),
    );
    if (!lesson || !this.car.grounded || this.feedback.needsRecovery) return;
    this.learnedLessons.add(lesson.id);
    this.saveSettings();
  }

  /** Place the ghost car at the recorded pose for the current lap time. */
  private updateGhost() {
    const visible =
      !!this.best &&
      this.prefs.ghost &&
      this.state === "racing" &&
      this.race.time <= this.best.time;
    this.world.ghost.visible = visible;
    if (this.ghostOpacityApplied !== this.prefs.ghostOpacity) {
      this.ghostOpacityApplied = this.prefs.ghostOpacity;
      // Keep the ghost contours readable after the strict palette resolve.
      const opacity = 0.5 + this.prefs.ghostOpacity * 0.5;
      this.world.ghost.traverse((object) => {
        const material = (object as { material?: unknown }).material;
        if (material && !Array.isArray(material))
          (material as { opacity: number }).opacity = opacity;
      });
    }
    if (!visible || !this.best) {
      this.world.ghost.wheelAnimation.reset();
      return;
    }
    const poses = this.best.poses;
    while (
      this.ghostIndex < poses.length - 2 &&
      poses[this.ghostIndex + 1].t <= this.race.time
    ) {
      this.ghostIndex++;
      if (poses[this.ghostIndex].cut) this.world.ghost.wheelAnimation.reset();
    }
    const a = poses[this.ghostIndex],
      b = poses[this.ghostIndex + 1];
    this.world.showGhost(
      a,
      b,
      Math.max(0, Math.min(1, (this.race.time - a.t) / (b.t - a.t || 1))),
    );
  }

  private updateHUD() {
    if (!this.hud.mounted) return;
    this.applyHUD();
    this.hud.update({
      time: format(this.race.time),
      speed: this.car.speed,
      reversing: this.car.grounded && this.car.speed < -0.5,
      nextCheckpoint: this.race.nextCheckpoint,
      finished: this.race.finished,
      position: this.car.position,
      heading: this.car.heading,
    });
  }

  private updateSound(input: Input) {
    const t = this.telemetry,
      car = this.car;
    const driving =
      this.state === "finished" && !document.querySelector("#results");
    t.speed = car.velocity.length();
    t.forward = car.velocity.dot(car.heading);
    t.throttle = input.throttle;
    t.brake = input.brake;
    t.poweredDrift = car.grounded && input.throttle > 0 && car.driftEngaged;
    t.slip =
      car.slipIntensity *
      Math.min(1, Math.max(0, car.normalLoad) / HANDLING.contactReferenceLoad);
    t.grounded = car.grounded;
    t.boost = car.boost > 0;
    t.scrape = car.railContact;
    t.active = this.state === "racing" || driving;
    t.paused = this.state === "paused";
    t.finished = this.state === "finished";
    car.position.toArray(t.position);
    car.heading.toArray(t.heading);
    car.up.toArray(t.up);
    this.sound.update(t);
  }

  /** Blend the last two simulation poses for the render frame. */
  private interpolatePose(alpha: number) {
    const pose = this.renderPose,
      car = this.car;
    pose.position.copy(this.previousPose.position).lerp(car.position, alpha);
    const rotation = orientation(
      this.previousPose.heading,
      this.previousPose.up,
    ).slerp(orientation(car.heading, car.up), alpha);
    pose.heading.set(0, 0, -1).applyQuaternion(rotation);
    pose.up.set(0, 1, 0).applyQuaternion(rotation);
    pose.steeringAngle =
      this.previousPose.steeringAngle +
      (car.steeringAngle - this.previousPose.steeringAngle) * alpha;
    pose.resetSerial = car.resetSerial;
    pose.grounded = car.grounded;
    pose.speed = car.speed;
    pose.boost = car.boost;
    pose.suspension = car.suspension;
    pose.velocity.copy(car.velocity);
    pose.slipIntensity = car.slipIntensity;
    pose.slipAngle = car.slipAngle;
    return pose;
  }

  /** One rendered frame. */
  loop = (now: number) => {
    pollGamepad(this);
    const elapsed = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(elapsed, MAX_FRAME);
    if (this.state === "racing" && elapsed > 0 && !document.hidden) {
      this.frameTimes[this.frameCursor] = elapsed * 1000;
      this.frameCursor = (this.frameCursor + 1) % this.frameTimes.length;
      this.frameCount = Math.min(this.frameCount + 1, this.frameTimes.length);
    }
    this.last = now;
    this.totalFrames++;
    this.frameSeconds += dt;
    const input = this.keyboard.resolve(this.padDrive);
    if (this.state === "ready" && input.throttle > 0 && !input.brake)
      this.launch();
    if (this.state === "racing") this.advanceRace(input, dt);
    if (this.state === "finished" && !document.querySelector("#results"))
      this.advanceFreeDrive(input, dt);
    this.updateGhost();
    this.updateHUD();
    this.updateSound(input);
    const alpha =
      this.state === "racing"
        ? Math.max(0, Math.min(1, this.accumulator / STEP))
        : 1;
    this.world.renderer.domElement.style.visibility =
      this.state === "title" ? "hidden" : "visible";
    if (this.state !== "title")
      this.world.render(
        this.interpolatePose(alpha),
        dt,
        false,
        now / 1000,
        alpha,
      );
    requestAnimationFrame(this.loop);
  };
}
