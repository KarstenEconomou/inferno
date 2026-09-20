import type { Vector3 } from "three";
import { HANDLING } from "../sim";
import { track } from "../track";
import type { HUDPrefs } from "../ui";
import type { Minimap } from "./minimap";

export type HUDLayout = { prefs: HUDPrefs; visible: boolean };
export type HUDFrame = {
  time: string;
  speed: number;
  reversing: boolean;
  nextCheckpoint: number;
  finished: boolean;
  position: Vector3;
  heading: Vector3;
};

/** Segments in the speed strip above the digits. */
const SEGMENTS = 12;
/** Speed, in km/h, that fills the strip: everything the car reaches on boost. */
const FULL_SCALE = HANDLING.boostSpeed * 3.6;

/** Three fixed corners. Each corner carries its readout and the label that
 * names it, and race events update those values without creating banners,
 * guidance, status text or other transient overlays. Nothing is printed on a
 * panel: the readouts sit straight on the road, in the same inks. */
export class HUD {
  private root: HTMLElement | null = null;
  private minimap!: Minimap;
  private marker!: SVGElement | null;
  private gates!: Element[];
  private lapLine!: HTMLElement;
  private splitLine!: HTMLElement;
  private time!: HTMLElement;
  private split!: HTMLElement;
  private progress!: HTMLElement;
  private splitIndex!: HTMLElement;
  private sectors!: HTMLElement[];
  private speedometer!: HTMLElement;
  private speed!: HTMLElement;
  private direction!: HTMLElement;
  private segments!: HTMLElement[];
  // Every readout remembers what it last printed. The race view writes to the
  // document only when a value actually changes, because a wasted write in
  // the frame loop costs the same frame that the car is driven in.
  private previous = {
    scale: "",
    safe: "",
    lit: -1,
    speed: -1,
    direction: "",
    split: "",
    stage: "",
    marker: "",
  };

  get mounted() {
    return !!this.root?.isConnected;
  }

  mount(container: HTMLElement, minimap: Minimap) {
    this.minimap = minimap;
    const splits = track.checkpoints.length + 1;
    container.innerHTML = `<div id="race-hud" class="mono">
      <div class="timing">
        <div class="hud-line" id="lap-line"><span class="hud-key">LAP</span><div id="time" aria-label="Lap time">00:00.000</div></div>
        <div class="hud-line" id="split-line"><span class="hud-key">SPLIT</span><div id="split-notice" aria-label="Split time">—</div></div>
      </div>
      <div class="run-state" role="group" aria-label="Split progress"><span class="hud-course">${
        track.name
      }</span>${minimap.svg(
        "hud-map plan-map",
        true,
      )}<span class="hud-key">SPLIT <b id="split-index">01/${String(
        splits,
      ).padStart(2, "0")}</b></span><div class="sector">${Array.from(
        { length: splits },
        (_, i) => `<span aria-label="Split ${i + 1}"></span>`,
      ).join("")}</div></div>
      <div class="speedometer" aria-label="Speed"><div class="speed-strip" aria-hidden="true">${Array.from(
        { length: SEGMENTS },
        () => "<i></i>",
      ).join(
        "",
      )}</div><div class="speed-readout"><span id="speed">000</span><span class="speed-unit">KM/H</span><span id="direction"></span></div></div>
    </div>`;
    const find = (selector: string) =>
      container.querySelector<HTMLElement>(selector)!;
    this.root = find("#race-hud");
    this.lapLine = find("#lap-line");
    this.splitLine = find("#split-line");
    this.time = find("#time");
    this.split = find("#split-notice");
    this.progress = find(".run-state");
    this.splitIndex = find("#split-index");
    this.sectors = [...container.querySelectorAll<HTMLElement>(".sector span")];
    this.speedometer = find(".speedometer");
    this.speed = find("#speed");
    this.direction = find("#direction");
    this.segments = [
      ...container.querySelectorAll<HTMLElement>(".speed-strip i"),
    ];
    this.marker = container.querySelector<SVGElement>(".hud-map #map-marker");
    this.gates = [...container.querySelectorAll(".hud-map .map-gate")];
    this.previous.lit = -1;
    this.previous.speed = -1;
    this.previous.direction = "";
    this.previous.split = "";
    this.previous.stage = "";
    this.previous.marker = "";
  }

  apply({ prefs, visible }: HUDLayout) {
    const scale = String(prefs.scale),
      safe = `${prefs.safe}px`;
    if (scale !== this.previous.scale) {
      document.documentElement.style.setProperty("--hud-scale", scale);
      this.previous.scale = scale;
    }
    if (safe !== this.previous.safe) {
      document.documentElement.style.setProperty("--safe", safe);
      this.previous.safe = safe;
    }
    if (!this.mounted) return;
    this.root!.classList.toggle("hud-off", !visible);
    this.lapLine.classList.toggle("hidden", !prefs.timer);
    this.splitLine.classList.toggle("hidden", !prefs.splits);
    this.progress.classList.toggle("hidden", !prefs.checkpoint);
    this.speedometer.classList.toggle("hidden", !prefs.speed);
  }

  update(frame: HUDFrame) {
    if (!this.mounted) return;
    this.time.textContent = frame.time;
    const speed = Math.round(Math.abs(frame.speed) * 3.6);
    if (speed !== this.previous.speed) {
      this.speed.textContent = speed.toString().padStart(3, "0");
      this.previous.speed = speed;
      const lit = Math.max(
        0,
        Math.min(SEGMENTS, Math.round((speed / FULL_SCALE) * SEGMENTS)),
      );
      if (lit !== this.previous.lit) {
        this.segments.forEach((mark, i) =>
          mark.classList.toggle("on", i < lit),
        );
        this.previous.lit = lit;
      }
    }
    // The car mark is the only part of the map that moves. It is written as
    // one transform, and only when the rounded value it prints has changed.
    if (this.marker) {
      const transform = this.minimap.markerTransform(
        frame.position,
        frame.heading,
      );
      if (transform !== this.previous.marker) {
        this.marker.setAttribute("transform", transform);
        this.previous.marker = transform;
      }
    }
    const direction = frame.reversing ? "REV" : "";
    if (direction !== this.previous.direction) {
      this.direction.textContent = direction;
      this.previous.direction = direction;
    }
    const stage = `${frame.nextCheckpoint}/${frame.finished}`;
    if (stage === this.previous.stage) return;
    this.previous.stage = stage;
    this.splitIndex.textContent = `${String(
      Math.min(frame.nextCheckpoint + 1, this.sectors.length),
    ).padStart(2, "0")}/${String(this.sectors.length).padStart(2, "0")}`;
    this.sectors.forEach((mark, i) => {
      const done = frame.finished || i < frame.nextCheckpoint;
      const current = !frame.finished && i === frame.nextCheckpoint;
      mark.classList.toggle("done", done);
      mark.classList.toggle("current", current);
      mark.setAttribute(
        "aria-label",
        `Split ${i + 1}: ${done ? "completed" : current ? "current" : "upcoming"}`,
      );
      if (current) mark.setAttribute("aria-current", "step");
      else mark.removeAttribute("aria-current");
    });
    this.gates.forEach((gate, i) =>
      gate.classList.toggle("done", frame.finished || i < frame.nextCheckpoint),
    );
  }

  /** Show a split time or a gap. A gap takes the ink of its own side of the
   * reference lap, so the player reads it without reading the sign. */
  showSplit(text: string, visible: boolean) {
    if (!this.mounted) return;
    this.split.textContent = text;
    this.split.classList.toggle("ahead", text.startsWith("−"));
    this.split.classList.toggle("behind", text.startsWith("+"));
    this.splitLine.classList.toggle("hidden", !visible);
  }
}
