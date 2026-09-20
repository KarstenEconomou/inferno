import { format } from "../../ui";
import type { Game } from "../game";
import { block, legend, MOVE, stat } from "./chrome";
import { row } from "./markup";

/** Opening screen: the three ways into the game, a standing report of what
 * this browser has saved, and one line of copy for the row under the cursor. */
const ENTRIES = [
  ["start", "TRACKS", "Choose a circuit and start a run."],
  ["records", "RECORDS", "Personal best, recent laps and best sectors."],
  ["settings", "SETTINGS", "Controls, camera, sound and display."],
] as const;

export function showTitle(game: Game) {
  const laps = game.history.length;
  game.ui.innerHTML = `${
    game.saveWarning
      ? '<div class="warning mono">Local saves unavailable.</div>'
      : ""
  }<section class="title-screen screen selection" data-screen="title"><header class="screen-head"><span class="label">TIME ATTACK</span><span class="head-meta mono">${
    game.saveWarning ? "SESSION RECORDS" : "LOCAL RECORDS"
  } · NO ACCOUNT · NO SERVER</span></header><div class="screen-body title-body"><div class="hero"><h1>INFERNO</h1><nav class="menu" aria-label="Main menu">${ENTRIES.map(
    ([id, label]) => row(id, label),
  ).join(
    "",
  )}</nav><p class="detail-line" id="title-detail">${ENTRIES[0][2]}</p></div><aside class="title-side">${block(
    "DRIVER RECORD",
    stat("BEST LAP", game.best ? format(game.best.time) : "—:—.———") +
      stat("SESSION", game.sessionBest ? format(game.sessionBest) : "—:—.———") +
      stat("LAPS LOGGED", String(laps).padStart(3, "0")) +
      stat("GHOST", game.prefs.ghost ? "ON" : "OFF") +
      stat("SAVE", game.saveWarning ? "SESSION ONLY" : "LOCAL"),
  )}</aside></div>${legend(game, [
    MOVE,
    { action: "confirm", label: "SELECT" },
  ])}</section>`;
  const detail = game.ui.querySelector<HTMLElement>("#title-detail")!;
  for (const [id, , copy] of ENTRIES) {
    const button = game.ui.querySelector<HTMLButtonElement>(`#${id}`)!;
    button.addEventListener("focus", () => (detail.textContent = copy));
    button.addEventListener("pointerenter", () => (detail.textContent = copy));
  }
  game.ui
    .querySelector("#start")!
    .addEventListener("click", () => game.trackSelect());
  game.ui
    .querySelector("#records")!
    .addEventListener("click", () => game.records());
  game.ui
    .querySelector("#settings")!
    .addEventListener("click", () => game.settings(true));
  game.ui
    .querySelector<HTMLButtonElement>("#start")!
    .focus({ preventScroll: true });
}
