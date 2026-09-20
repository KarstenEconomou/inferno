import { rebind, rebindPad, type Action } from "../../ui";
import type { Game } from "../game";
import { refreshCues } from "../screens/chrome";
import {
  adjustValue,
  cycleFocus,
  DIALOG_CONTROLS,
  navigate,
  rememberFocus,
  type Direction,
} from "./focus";

/** Keys that move the menu cursor. The glyph on the key is the direction the
 * cursor takes, on every screen, without exception. */
const DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};
/** Keys that turn a page of the options book, beside the shoulder buttons. */
const PAGE_KEYS: Record<string, number> = {
  KeyQ: -1,
  KeyE: 1,
  BracketLeft: -1,
  BracketRight: 1,
};
/** Actions that a gamepad can trigger while driving. */
const DRIVING_ACTIONS: Action[] = [
  "restart",
  "respawn",
  "ghost",
  "splits",
  "camera",
  "camera1",
  "camera2",
  "camera3",
  "hud",
  "menu",
];
/** Standard-mapping d-pad buttons and the two shoulder buttons that page. */
const DPAD = { up: 12, down: 13, left: 14, right: 15 };
const SHOULDER = { previous: 4, next: 5 };

const dialog = () => document.querySelector<HTMLElement>(".overlay");
const settingsOpen = () =>
  document.querySelector<HTMLElement>(".settings-overlay");

/** Remember which device the player is holding, and rewrite every command
 * prompt when that changes, so no prompt names an absent device. */
function setDevice(game: Game, device: "keyboard" | "controller") {
  if (game.inputDevice === device) return;
  game.inputDevice = device;
  refreshCues(game);
}

/** One step of the menu cursor. A horizontal step on a control that carries a
 * value changes the value instead of moving, the way a console options list
 * behaves; everywhere else the cursor follows the screen. */
function menuStep(game: Game, direction: Direction) {
  const root = dialog() ?? game.ui;
  const focused = document.activeElement;
  const horizontal = direction === "left" || direction === "right";
  if (
    horizontal &&
    focused &&
    root.contains(focused) &&
    adjustValue(focused, direction === "right" ? 1 : -1)
  ) {
    game.sound.emit("ui.move");
    return;
  }
  // Nothing lies that way. Saying so is better than moving somewhere the
  // press did not point.
  if (!navigate(root, direction)) game.sound.emit("ui.denied");
}

function captureKey(game: Game, event: KeyboardEvent, action: Action) {
  event.preventDefault();
  const swapped = rebind(game.prefs.bindings, action, event.code);
  game.captureBinding = null;
  game.keyboard.rebound(game.prefs.bindings);
  game.saveSettings();
  game.settings(
    game.state === "title",
    "CONTROLS",
    `[data-action="${action}"]`,
  );
  document
    .querySelector(`[data-action="${action}"]`)
    ?.setAttribute(
      "title",
      swapped ? `Swapped with ${swapped}` : "Binding saved",
    );
}

function onKeyDown(game: Game, e: KeyboardEvent) {
  setDevice(game, "keyboard");
  if (game.captureBinding) return captureKey(game, e, game.captureBinding);
  const action = game.keyboard.actionFor(e.code);
  const overlay = dialog();
  const inMenu = !!overlay || game.state === "title";
  if (action === "menu" || (action === "restart" && game.state !== "title")) {
    e.preventDefault();
    if (!e.repeat) game.action(action);
    return;
  }
  if (overlay && e.code === "Tab") {
    e.preventDefault();
    cycleFocus(overlay, DIALOG_CONTROLS, e.shiftKey ? -1 : 1);
    return;
  }
  if (settingsOpen() && PAGE_KEYS[e.code]) {
    e.preventDefault();
    if (!e.repeat) game.pageSettings(PAGE_KEYS[e.code]);
    return;
  }
  if (inMenu && DIRECTIONS[e.code]) {
    e.preventDefault();
    menuStep(game, DIRECTIONS[e.code]);
    return;
  }
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLSelectElement
  )
    return;
  if (inMenu && action === "confirm") {
    e.preventDefault();
    if (e.repeat) return;
    const focused = document.activeElement;
    // On the track sheet the list rows only choose a circuit, so a confirm
    // there starts the run instead of pressing the row again.
    if (
      !overlay &&
      game.screen === "tracks" &&
      (!(focused instanceof HTMLButtonElement) ||
        focused.hasAttribute("data-circuit"))
    )
      game.action("confirm");
    else if (focused instanceof HTMLButtonElement) focused.click();
    else game.action("confirm");
    return;
  }
  if (
    e.target instanceof HTMLButtonElement &&
    ["Enter", "Space"].includes(e.code)
  ) {
    if (e.repeat) e.preventDefault();
    return;
  }
  if (action || e.code.startsWith("Arrow")) e.preventDefault();
  if (["racing", "ready", "finished"].includes(game.state))
    game.keyboard.add(e.code);
  if (action && !e.repeat) game.action(action);
}

/** Route a gamepad frame. In a menu the pad drives the cursor, the pages and
 * the confirmation; while driving it supplies the run actions and the axes. */
export function pollGamepad(game: Game) {
  game.padDrive = { throttle: 0, brake: false, steer: 0 };
  if (!game.pad.poll()) return;
  const pad = game.pad,
    binding = game.prefs.padBindings;
  if (pad.active) {
    setDevice(game, "controller");
    if (!game.sound.ctx) game.sound.init();
  }
  if (game.capturePad) {
    const index = pad.firstPressed();
    if (index >= 0) {
      rebindPad(binding, game.capturePad, index);
      const action = game.capturePad;
      game.capturePad = null;
      game.saveSettings();
      game.settings(
        game.state === "title",
        "CONTROLS",
        `[data-pad="${action}"]`,
      );
    }
    pad.commit();
    return;
  }
  const inMenu =
    game.state === "title" ||
    game.state === "paused" ||
    !!document.querySelector("#results");
  if (inMenu) routeMenu(game);
  else routeDriving(game);
  pad.commit();
}

/** The direction that the pad asks for this frame, from the d-pad or from one
 * push of the left stick. */
function padDirection(game: Game): Direction | null {
  const pad = game.pad,
    stick = pad.stickStep();
  if (pad.pressed(DPAD.up) || stick.y < 0) return "up";
  if (pad.pressed(DPAD.down) || stick.y > 0) return "down";
  if (pad.pressed(DPAD.left) || stick.x < 0) return "left";
  if (pad.pressed(DPAD.right) || stick.x > 0) return "right";
  return null;
}

function routeMenu(game: Game) {
  const pad = game.pad,
    binding = game.prefs.padBindings;
  const direction = padDirection(game);
  if (direction) menuStep(game, direction);
  if (settingsOpen()) {
    if (pad.pressed(SHOULDER.previous)) game.pageSettings(-1);
    if (pad.pressed(SHOULDER.next)) game.pageSettings(1);
  }
  if (pad.pressed(binding.confirm)) {
    const focused = document.activeElement;
    if (
      !dialog() &&
      game.screen === "tracks" &&
      focused instanceof HTMLElement &&
      focused.hasAttribute("data-circuit")
    )
      game.action("confirm");
    else if (
      focused instanceof HTMLButtonElement ||
      (focused instanceof HTMLInputElement && focused.type === "checkbox")
    )
      focused.click();
    else game.action("confirm");
  }
  if (pad.pressed(binding.menu)) game.action("menu");
  if (pad.pressed(binding.restart)) game.action("restart");
}

function routeDriving(game: Game) {
  const pad = game.pad,
    binding = game.prefs.padBindings;
  for (const a of DRIVING_ACTIONS) if (pad.pressed(binding[a])) game.action(a);
  if (game.state === "finished" && pad.pressed(binding.confirm))
    game.action("confirm");
  game.padDrive = {
    throttle: pad.value(binding.throttle),
    brake: pad.brakeHeld(binding.brake, binding.brakeSecondary),
    steer: Math.max(
      -1,
      Math.min(
        1,
        pad.steer +
          Number(pad.held(binding.right)) -
          Number(pad.held(binding.left)),
      ),
    ),
  };
}

/** Attach every document-level listener that the game needs. */
export function attachInput(game: Game) {
  document.addEventListener("pointerdown", () => game.sound.init(), {
    capture: true,
  });
  document.addEventListener("keydown", () => game.sound.init(), {
    capture: true,
  });
  game.ui.addEventListener("focusin", (e) => {
    const target = e.target as HTMLElement;
    if (!target.matches("button,input,select")) return;
    rememberFocus(target);
    if (!target.closest("[data-audio-debug]")) game.sound.emit("ui.move");
  });
  game.ui.addEventListener(
    "click",
    (e) => {
      const button = (e.target as HTMLElement).closest("button");
      if (!button || button.closest("[data-audio-debug]")) return;
      if (
        button.hasAttribute("data-circuit") ||
        ["drive", "again", "retry"].includes(button.id)
      )
        return;
      // Emit after the menu rebuilds, so a theme change cannot erase the
      // confirmation or give it the timbre of the previous circuit.
      queueMicrotask(() =>
        game.sound.emit(
          ["exit", "back-title"].includes(button.id) ? "ui.back" : "ui.confirm",
        ),
      );
    },
    { capture: true },
  );
  document.addEventListener("keydown", (e) => onKeyDown(game, e));
  document.addEventListener("keyup", (e) => {
    game.keyboard.delete(e.code);
  });
  window.addEventListener("blur", () => game.loseFocus());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) game.loseFocus();
  });
}
