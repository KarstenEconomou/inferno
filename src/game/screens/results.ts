import { track } from "../../track";
import { delta, format, pace, sectors } from "../../ui";
import type { Game } from "../game";
import { block, legend, MOVE, stat } from "./chrome";
import { row } from "./markup";

/** Sector table for the current run against the reference run. A sector with
 * no time yet stays empty instead of showing a misleading zero. */
export function splitTable(game: Game) {
  const reference = game.result ? game.result.previous : game.best;
  const times = game.race.finished
    ? sectors(game.race.splits, game.race.time)
    : game.race.splits.map((t, i) => t - (i ? game.race.splits[i - 1] : 0));
  const pb = reference ? sectors(reference.splits, reference.time) : [];
  return `<table><thead><tr><th>SPLIT</th><th>RUN</th><th>PB</th><th>Δ</th></tr></thead><tbody>${Array.from(
    { length: track.checkpoints.length + 1 },
    (_, i) => {
      const gap =
        times[i] !== undefined && pb[i] !== undefined ? times[i] - pb[i] : null;
      return `<tr><td>${String(i + 1).padStart(2, "0")}</td><td>${
        times[i] !== undefined ? format(times[i]) : "—"
      }</td><td>${pb[i] !== undefined ? format(pb[i]) : "—"}</td><td class="${
        gap === null ? "" : gap > 0 ? "behind" : "ahead"
      }">${gap === null ? "—" : delta(gap)}</td></tr>`;
    },
  ).join("")}</tbody></table>`;
}

/** Full result dialog with the sector comparison. */
export function showResults(game: Game) {
  document.querySelector("#results")?.remove();
  const el = document.createElement("section");
  el.className = "overlay";
  el.id = "results";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Lap complete");
  el.setAttribute("aria-modal", "true");
  const previous = game.result?.previous ?? null;
  el.innerHTML = `<div class="panel results-panel"><header class="panel-head"><p class="eyebrow">${track.name.toUpperCase()} / RUN ${String(
    game.runs,
  ).padStart(
    3,
    "0",
  )}</p><h2>${game.result?.isBest ? "PERSONAL BEST" : "RUN COMPLETE"}</h2></header><div class="result-headline"><div class="result-time mono">${format(
    game.race.time,
  )}</div><div class="result-compare">${stat(
    "PREVIOUS BEST",
    previous ? format(previous.time) : "FIRST LAP",
  )}${stat(
    "PACE",
    previous ? pace(game.race.time - previous.time) : "—",
    previous && game.race.time > previous.time ? "behind" : "ahead",
  )}${stat("GHOST", game.saveWarning ? "SESSION ONLY" : "SAVED")}</div></div>${block(
    "SECTOR COMPARISON",
    splitTable(game),
  )}<div class="menu result-actions">${row("again", "RESTART")}${row(
    "exit",
    "TRACKS",
  )}</div>${legend(game, [
    MOVE,
    { action: "confirm", label: "SELECT" },
    { action: "menu", label: "TRACKS" },
  ])}</div>`;
  game.ui.append(el);
  el.querySelector("#again")!.addEventListener("click", () => game.start());
  el.querySelector("#exit")!.addEventListener("click", () =>
    game.trackSelect(),
  );
  el.querySelector<HTMLButtonElement>("#again")!.focus();
}
