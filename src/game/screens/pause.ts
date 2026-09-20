import { track } from "../../track";
import { circuits, format } from "../../ui";
import type { Game } from "../game";
import { block, legend, MOVE, stat } from "./chrome";
import { row } from "./markup";

/** Pause panel. It is a dialog, so focus stays inside it until it closes.
 * The left column holds the actions and the right column holds the state of
 * the held run: where the car stands on the plan, and how the clock reads. */
export function showPause(game: Game) {
  document.querySelector("#settings-overlay")?.remove();
  const overlay = document.createElement("section");
  overlay.id = "settings-overlay";
  overlay.className = "overlay pause-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Paused");
  const splits = track.checkpoints.length + 1;
  overlay.innerHTML = `<div class="panel pause-panel"><header class="panel-head"><p class="eyebrow">${
    circuits[game.selectedCircuit].theme.display_name
  } / RUN ${String(game.runs).padStart(3, "0")}</p><h2>PAUSED</h2></header><div class="panel-columns"><nav class="menu" aria-label="Pause menu">${row(
    "resume",
    "RESUME RUN",
  )}${row("retry", "RESTART")}${row(
    "ghost-menu",
    "GHOST",
    game.prefs.ghost ? "PB" : "OFF",
  )}${row("tracks-menu", "TRACK")}${row("setup-menu", "SETTINGS")}${row(
    "exit",
    "QUIT TO TITLE",
  )}</nav><aside class="pause-state"><div class="pause-map">${game.minimap.svg(
    "course-map plan-map",
    true,
  )}</div>${block(
    "RUN",
    stat("LAP", format(game.race.time)) +
      stat(
        "SPLIT",
        `${String(Math.min(game.race.nextCheckpoint + 1, splits)).padStart(2, "0")} / ${String(splits).padStart(2, "0")}`,
      ) +
      stat("PERSONAL BEST", game.best ? format(game.best.time) : "—:—.———") +
      stat(
        "SESSION BEST",
        game.sessionBest ? format(game.sessionBest) : "—:—.———",
      ) +
      stat("RUNS", String(game.runs).padStart(3, "0")),
  )}</aside></div>${legend(game, [
    MOVE,
    { action: "confirm", label: "SELECT" },
    { action: "menu", label: "RESUME" },
    { action: "restart", label: "RESTART" },
  ])}</div>`;
  game.ui.append(overlay);
  const marker = overlay.querySelector("#map-marker");
  marker?.setAttribute(
    "transform",
    game.minimap.markerTransform(game.car.position, game.car.heading),
  );
  overlay.querySelectorAll(".map-gate").forEach((gate, i) => {
    if (i < game.race.nextCheckpoint) gate.classList.add("done");
  });
  overlay
    .querySelector("#resume")!
    .addEventListener("click", () => game.closeSettings());
  overlay
    .querySelector("#retry")!
    .addEventListener("click", () => game.start());
  overlay.querySelector("#ghost-menu")!.addEventListener("click", () => {
    game.prefs.ghost = !game.prefs.ghost;
    game.saveSettings();
    game.pause();
  });
  overlay
    .querySelector("#tracks-menu")!
    .addEventListener("click", () => game.trackSelect());
  overlay
    .querySelector("#setup-menu")!
    .addEventListener("click", () => game.settings());
  overlay.querySelector("#exit")!.addEventListener("click", () => game.title());
  overlay.querySelector<HTMLButtonElement>("#resume")!.focus();
}
