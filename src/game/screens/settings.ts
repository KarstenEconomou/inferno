import { CAMERA_NAMES } from "../../render/camera";
import {
  actionName,
  actions,
  circuits,
  GHOST_OPACITY,
  HUD_SAFE_ZONE,
  HUD_SCALE,
  keyName,
  padName,
  type Action,
} from "../../ui";
import type { Game } from "../game";
import {
  ADJUST,
  legend,
  MOVE,
  MOVE_ANY,
  PAGE,
  block,
  stat,
  type Cue,
} from "./chrome";
import { checkbox, fill, range, row, select, valueText } from "./markup";

/** The pages of the options book, in the order that the shoulder buttons
 * turn them. The first page is the page that SETTINGS opens on. */
export const SETTINGS_CATEGORIES = [
  "DISPLAY",
  "CONTROLS",
  "CAMERA",
  "AUDIO",
  "GHOST",
  "VIDEO",
  "RULES",
];

const mixBuses = ["music", "vehicle", "sfx", "ambience"] as const;
const hudToggles: Record<string, [string, string]> = {
  timer: ["LAP TIME", "The running clock in the top corner."],
  delta: [
    "COMPARE SPLIT TO BEST",
    "Show each split as a gap to the personal best instead of a time.",
  ],
  splits: ["SPLIT TIME", "The split readout under the clock."],
  checkpoint: ["SPLIT PROGRESS", "The bar for each split of the lap."],
  speed: ["SPEEDOMETER", "Road speed in kilometres per hour."],
};

/** One page of the options book. */
function categoryContent(game: Game, category: string) {
  const prefs = game.prefs;
  if (category === "DISPLAY")
    return (
      Object.keys(hudToggles)
        .map((k) =>
          checkbox(
            `hud-${k}`,
            hudToggles[k][0],
            prefs.hud[k as "timer"],
            hudToggles[k][1],
          ),
        )
        .join("") +
      range(
        "hud-scale",
        "HUD SCALE",
        HUD_SCALE.min,
        HUD_SCALE.max,
        0.05,
        prefs.hud.scale,
        "percent",
        "Size of every head-up readout.",
      ) +
      range(
        "hud-safe",
        "SAFE ZONE",
        HUD_SAFE_ZONE.min,
        HUD_SAFE_ZONE.max,
        4,
        prefs.hud.safe,
        "px",
        "Distance from the readouts to the edge of the screen.",
      )
    );
  if (category === "AUDIO")
    return (
      checkbox(
        "mute-setting",
        "MUTE AUDIO",
        game.sound.muted,
        "Silence every bus without losing the mix.",
      ) +
      range(
        "volume-setting",
        "MASTER",
        0,
        1,
        0.05,
        game.sound.volume,
        "percent",
        "Level of the whole mix.",
      ) +
      mixBuses
        .map((bus) =>
          range(
            `mix-${bus}`,
            bus.toUpperCase(),
            0,
            1,
            0.05,
            game.sound.mix[bus],
            "percent",
            BUS_HELP[bus],
          ),
        )
        .join("")
    );
  if (category === "GHOST")
    return (
      checkbox(
        "ghost-setting",
        "PERSONAL BEST GHOST",
        prefs.ghost,
        "Replay the saved best lap beside the run.",
      ) +
      range(
        "ghost-opacity",
        "GHOST OPACITY",
        GHOST_OPACITY.min,
        GHOST_OPACITY.max,
        0.05,
        prefs.ghostOpacity,
        "percent",
        "How solid the replayed car is drawn.",
      ) +
      block(
        "SOURCES",
        stat("PERSONAL BEST", "AVAILABLE") +
          stat("SESSION", "RESERVED") +
          stat("AUTHOR", "RESERVED") +
          stat("WORLD", "RESERVED"),
      )
    );
  if (category === "CONTROLS")
    return `<div class="binding-table"><div class="binding-head label"><span>ACTION</span><span>KEY</span><span>PAD</span></div>${actions
      .map(
        (a) =>
          `<div class="binding-row" data-help="Select a cell, then press the key or the button to bind. A duplicate exchanges the two bindings."><span class="binding-name">${actionName(
            a,
          )}</span><button class="binding mono" data-action="${a}">${keyName(
            prefs.bindings[a],
          )}</button><button class="binding mono" data-pad="${a}">${padName(
            prefs.padBindings,
            a,
          )}</button></div>`,
      )
      .join(
        "",
      )}</div><p class="card-note">Left-stick steering stays available beside the bound buttons. Confirm and the second brake share A, because their contexts never overlap.</p>${row(
      "reset-bindings",
      "RESET BINDINGS",
    )}`;
  if (category === "RULES")
    return block(
      "TIME ATTACK",
      stat("FORMAT", "ONE LAP / THREE GATES") +
        stat("START", "INSTANT / NO COUNTDOWN") +
        stat("RESTART", "HELD THROTTLE CONTINUES") +
        stat("RESPAWN", "CLOCK KEEPS RUNNING") +
        stat("SLIDE", "STEER, THEN BRAKE AT 191+ KM/H") +
        stat("SLIDE EXIT", "RELEASE BRAKE OR COUNTERSTEER") +
        stat("AIR BRAKE", "ARRESTS THE PITCH") +
        stat("AIR STEER", "COUNTERSTEER CANCELS SPIN") +
        stat("DISTANCE", "HOLD THROTTLE OFF THE RAMP"),
    );
  if (category === "VIDEO")
    return block(
      "RENDERER",
      stat("PROCESS", "THREE-TONE PRINT") +
        stat("SCALING", "AUTOMATIC VIEWPORT") +
        stat("CAMERAS", CAMERA_NAMES.join(" / ").toUpperCase()) +
        stat(
          "PALETTE",
          circuits[game.selectedCircuit].paletteNames.join(" / "),
        ),
    );
  if (category === "CAMERA") {
    const camera = game.world.cameraController.settings;
    return (
      select(
        "camera-preset",
        "DEFAULT PRESET",
        CAMERA_NAMES.map((name, i) => `${i + 1} / ${name}`),
        camera.preset,
        "The camera that every run starts with.",
      ) +
      range(
        "camera-fov",
        "VERTICAL FOV",
        55,
        85,
        1,
        camera.fov,
        "deg",
        "Vertical field of view of the driving camera.",
      ) +
      checkbox(
        "camera-speed-fov",
        "SPEED FOV EFFECT",
        camera.speedFov,
        "Widen the view as the car gains speed.",
      ) +
      '<p class="card-note">The chosen preset stays active through loops and flight.</p>'
    );
  }
  return "";
}

const BUS_HELP: Record<(typeof mixBuses)[number], string> = {
  music: "Reserved: there is no soundtrack.",
  vehicle: "Engine, tyres and impacts.",
  sfx: "Race events and interface sounds.",
  ambience: "The structures and the district around the road.",
};

/** The command bar of one page. A page of switches and sliders adjusts with
 * the horizontal arrows; a page of bindings uses them to cross between the
 * key and the button; a page of plain data uses them for nothing at all. */
function pageCues(category: string, fromTitle: boolean): Cue[] {
  const back: Cue = { action: "menu", label: fromTitle ? "BACK" : "RESUME" };
  if (category === "CONTROLS")
    return [MOVE_ANY, { action: "confirm", label: "BIND" }, PAGE, back];
  if (category === "RULES" || category === "VIDEO")
    return [MOVE, PAGE, { action: "confirm", label: "SELECT" }, back];
  return [MOVE, ADJUST, PAGE, { action: "confirm", label: "SELECT" }, back];
}

/** Apply one settings control. Every control saves at once, so the panel
 * needs no confirm step and nothing is lost if the page closes. */
function applyControl(game: Game, el: HTMLInputElement) {
  const id = el.id;
  if (id.startsWith("hud-")) {
    const key = id.slice(4);
    if (key === "scale" || key === "safe") game.prefs.hud[key] = +el.value;
    else game.prefs.hud[key as "timer"] = el.checked;
  }
  if (id === "camera-fov") {
    game.world.cameraController.settings.fov = +el.value;
    game.world.resetCamera(game.car);
  }
  if (id === "camera-speed-fov") {
    game.world.cameraController.settings.speedFov = el.checked;
    game.world.resetCamera(game.car);
  }
  if (id === "mute-setting") game.sound.muted = el.checked;
  if (id === "ghost-setting") game.prefs.ghost = el.checked;
  if (id === "volume-setting") game.sound.volume = +el.value;
  if (id.startsWith("mix-"))
    game.sound.setMix({ ...game.sound.mix, [id.slice(4)]: +el.value });
  if (id === "ghost-opacity") game.prefs.ghostOpacity = +el.value;
  if (el.type === "range")
    el.style.setProperty(
      "--fill",
      fill(Number(el.min), Number(el.max), Number(el.value)),
    );
  const state = el
    .closest(".setting")
    ?.querySelector<HTMLElement>(`[data-state="${id}"]`);
  if (state) state.textContent = valueText(el);
  game.saveSettings();
  game.applyHUD();
}

/** Settings dialog. The same book opens from the title screen and from a
 * paused run; only the closing label differs. The cursor runs down the rows
 * of one page, the shoulder buttons turn the pages, and the help line under
 * the rows explains whatever the cursor holds. */
export function showSettings(
  game: Game,
  fromTitle: boolean,
  category: string,
  focusSelector?: string,
) {
  document.querySelector("#settings-overlay")?.remove();
  const overlay = document.createElement("section");
  overlay.className = "overlay settings-overlay";
  overlay.id = "settings-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Settings");
  const index = Math.max(0, SETTINGS_CATEGORIES.indexOf(category));
  const content = categoryContent(game, category);
  overlay.innerHTML = `<div class="panel settings-panel"><header class="panel-head"><p class="eyebrow">${
    circuits[game.selectedCircuit].theme.display_name
  } / SETUP</p><h2>SETTINGS</h2><span class="page-count mono">${String(
    index + 1,
  ).padStart(
    2,
    "0",
  )}/${String(SETTINGS_CATEGORIES.length).padStart(2, "0")}</span></header><nav class="tabs" aria-label="Settings pages"><span class="cue page-cue" data-key="Q" data-pad-key="LB"><b class="key">Q</b></span><div class="tab-strip">${SETTINGS_CATEGORIES.map(
    (c) =>
      `<button data-category="${c}" data-cursor-skip class="${c === category ? "selected" : ""}"${
        c === category ? ' aria-current="page"' : ""
      }>${c}</button>`,
  ).join(
    "",
  )}</div><span class="cue page-cue" data-key="E" data-pad-key="RB"><b class="key">E</b></span></nav><div class="settings-content">${content}</div>${
    content.includes("data-help")
      ? '<p class="detail-line" id="settings-help">&nbsp;</p>'
      : ""
  }<div class="menu">${row(
    "resume",
    fromTitle ? "BACK" : "RESUME RUN",
  )}</div>${legend(game, pageCues(category, fromTitle))}</div>`;
  game.ui.append(overlay);
  const help = overlay.querySelector<HTMLElement>("#settings-help");
  if (help)
    overlay.addEventListener("focusin", (e) => {
      const owner = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-help]",
      );
      help.textContent = owner?.dataset.help || "\u00a0";
    });
  for (const tab of overlay.querySelectorAll<HTMLButtonElement>(
    "[data-category]",
  ))
    tab.onclick = () => game.settings(fromTitle, tab.dataset.category);
  for (const el of overlay.querySelectorAll<HTMLInputElement>("input"))
    el.oninput = () => applyControl(game, el);
  const preset = overlay.querySelector<HTMLSelectElement>("#camera-preset");
  if (preset)
    preset.onchange = () => {
      game.world.cameraMode = +preset.value;
      game.world.cameraController.settings.preset = game.world.cameraMode;
      game.saveSettings();
    };
  for (const b of overlay.querySelectorAll<HTMLButtonElement>("[data-action]"))
    b.onclick = () => {
      game.captureBinding = b.dataset.action as Action;
      game.capturePad = null;
      b.textContent = "PRESS KEY…";
      b.classList.add("capturing");
    };
  for (const b of overlay.querySelectorAll<HTMLButtonElement>("[data-pad]"))
    b.onclick = () => {
      game.capturePad = b.dataset.pad as Action;
      game.captureBinding = null;
      b.textContent = "PRESS BUTTON…";
      b.classList.add("capturing");
    };
  overlay.querySelector("#reset-bindings")?.addEventListener("click", () => {
    game.resetBindings();
    game.settings(fromTitle, "CONTROLS");
  });
  overlay
    .querySelector("#resume")!
    .addEventListener("click", () => game.closeSettings());
  const target =
    (focusSelector && overlay.querySelector<HTMLElement>(focusSelector)) ||
    overlay.querySelector<HTMLElement>(
      ".settings-content input:not(:disabled),.settings-content select,.settings-content button:not(:disabled)",
    ) ||
    overlay.querySelector<HTMLElement>("#resume")!;
  target.focus({ preventScroll: true });
}
