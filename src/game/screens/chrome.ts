import type { Action } from "../../ui";
import type { Game } from "../game";

/** The shared frame of every screen: a title bar that says where the player
 * is, and a command bar that says what every control does. Both stay in the
 * same place on every screen, so the player never hunts for them. */

export type Cue = {
  /** A bound action, so the prompt follows a rebinding and the device. */
  action?: Action;
  /** A fixed keyboard glyph for a prompt that is not a bound action. */
  key?: string;
  /** The controller form of that glyph. */
  pad?: string;
  label: string;
  /** Marks the prompt so a screen can withdraw it when it does not apply. */
  id?: string;
};

/** Cursor prompts. The direction glyphs match the arrows that the player
 * presses, and a controller shows its own pad instead. */
export const MOVE: Cue = { key: "↑↓", pad: "D-PAD", label: "MOVE" };
export const MOVE_ANY: Cue = { key: "↑↓←→", pad: "D-PAD", label: "MOVE" };
export const ADJUST: Cue = { key: "←→", pad: "D-PAD ←→", label: "ADJUST" };
export const PAGE: Cue = { key: "Q / E", pad: "LB / RB", label: "PAGE" };

const cueKey = (game: Game, c: Cue) =>
  c.action
    ? game.bindingLabel(c.action)
    : ((game.inputDevice === "controller" ? c.pad : c.key) ?? c.key ?? "");

const cue = (game: Game, c: Cue) =>
  `<span class="cue${c.id ? ` cue-${c.id}` : ""}"${c.action ? ` data-cue="${c.action}"` : ""}${
    c.key ? ` data-key="${c.key}"` : ""
  }${c.pad ? ` data-pad-key="${c.pad}"` : ""}><b class="key">${cueKey(
    game,
    c,
  )}</b>${c.label}</span>`;

/** The command bar. Prompts read in the order that the player needs them:
 * how to move, how to act, how to leave. */
export const legend = (game: Game, cues: Cue[]) =>
  `<footer class="legend" aria-label="Controls">${cues
    .map((c) => cue(game, c))
    .join("")}</footer>`;

/** Rewrite every prompt after the player picks up or puts down a controller,
 * so the command bars never name a device that is not in the player's hands. */
export function refreshCues(game: Game) {
  for (const el of document.querySelectorAll<HTMLElement>(".cue")) {
    const key = el.querySelector("b");
    if (!key) continue;
    if (el.dataset.cue)
      key.textContent = game.bindingLabel(el.dataset.cue as Action);
    else
      key.textContent =
        (game.inputDevice === "controller"
          ? el.dataset.padKey
          : el.dataset.key) ??
        el.dataset.key ??
        "";
  }
}

/** Title bar: the wordmark, the path that reached this screen, and one line
 * of context for the screen itself. */
export const head = (path: string[], meta = "") =>
  `<header class="screen-head"><span class="brand">INFERNO</span><nav class="crumbs label" aria-label="Location">${path
    .map(
      (step, i) =>
        `<span class="${i === path.length - 1 ? "crumb now" : "crumb"}">${step}</span>`,
    )
    .join("")}</nav><span class="head-meta mono">${meta}</span></header>`;

/** A full screen inside the shared frame. */
export const screen = (
  game: Game,
  options: {
    name: string;
    path: string[];
    meta?: string;
    body: string;
    cues: Cue[];
  },
) =>
  `<section class="screen selection" data-screen="${options.name}">${head(
    options.path,
    options.meta,
  )}<div class="screen-body">${options.body}</div>${legend(game, options.cues)}</section>`;

/** A labelled group inside a screen or a panel. */
export const block = (title: string, body: string, className = "") =>
  `<section class="block ${className}"><h3 class="block-title label">${title}</h3>${body}</section>`;

/** One line of a data sheet: a name, a leader and a value. */
export const stat = (label: string, value: string, className = "") =>
  `<div class="stat ${className}"><span class="stat-name">${label}</span><span class="stat-value mono">${value}</span></div>`;

/** A rating drawn as filled blocks, the way a console car sheet draws one. */
export const meter = (label: string, value: number, max = 5) =>
  `<div class="stat meter"><span class="stat-name">${label}</span><span class="stat-value bars" role="img" aria-label="${label} ${value} of ${max}">${Array.from(
    { length: max },
    (_, i) => `<i class="${i < value ? "on" : ""}"></i>`,
  ).join("")}</span></div>`;
