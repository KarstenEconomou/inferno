import { track } from "../../track";
import { circuits, delta, format } from "../../ui";
import type { Game } from "../game";
import { block, head, legend, MOVE, stat } from "./chrome";
import { row } from "./markup";

/** Rows kept on the recent-lap sheet. Empty places stay printed, so the sheet
 * reads as a form that the player fills in rather than as a missing table. */
const SHEET_ROWS = 8;
const NO_TIME = "—:—.———";

/** Timing sheet: personal best, session best, recent laps and best sectors.
 * The theoretical optimum adds the best sectors and is labelled as such,
 * because it is not a lap that the player completed. */
export function showRecords(game: Game) {
  const count = track.checkpoints.length + 1;
  const logged = game.history.length;
  const best = Array.from({ length: count }, (_, i) =>
    Math.min(...game.history.map((h) => h.sectors[i])),
  );
  const recent = game.history.slice().reverse().slice(0, SHEET_ROWS);
  game.ui.innerHTML = `<section class="screen selection records-screen" data-screen="records">${head(
    ["RECORDS"],
    circuits[game.selectedCircuit].theme.display_name,
  )}<div class="screen-body records-body"><div class="records-columns"><div>${block(
    "STANDING",
    stat(
      "PERSONAL BEST",
      game.best ? format(game.best.time) : NO_TIME,
      "wide",
    ) +
      stat(
        "SESSION BEST",
        game.sessionBest ? format(game.sessionBest) : NO_TIME,
      ) +
      stat("LAPS LOGGED", String(logged).padStart(3, "0")) +
      stat(
        "THEORETICAL OPTIMUM",
        logged ? format(best.reduce((a, b) => a + b, 0)) : NO_TIME,
      ),
  )}${block(
    "BEST SECTORS",
    best
      .map((t, i) =>
        stat(
          `SPLIT ${String(i + 1).padStart(2, "0")}`,
          logged ? format(t) : NO_TIME,
        ),
      )
      .join("") +
      '<p class="card-note">Combined sector bests. Not a completed lap.</p>',
  )}</div><div>${block(
    "RECENT LAPS",
    `<table><thead><tr><th>#</th><th>DATE</th><th>TIME</th><th>Δ PB</th></tr></thead><tbody>${Array.from(
      { length: SHEET_ROWS },
      (_, i) => {
        const lap = recent[i];
        const gap = lap && game.best ? lap.time - game.best.time : null;
        return `<tr${lap ? "" : ' class="empty"'}><td>${String(i + 1).padStart(
          2,
          "0",
        )}</td><td>${lap ? lap.date : "—"}</td><td>${
          lap ? format(lap.time) : NO_TIME
        }</td><td class="${gap === null ? "" : gap > 0 ? "behind" : "ahead"}">${
          gap === null ? "—" : delta(gap)
        }</td></tr>`;
      },
    ).join("")}</tbody></table>`,
  )}</div></div><div class="records-action">${row("back-title", "BACK")}</div></div>${legend(
    game,
    [
      MOVE,
      { action: "confirm", label: "SELECT" },
      { action: "menu", label: "BACK" },
    ],
  )}</section>`;
  const back = game.ui.querySelector<HTMLButtonElement>("#back-title")!;
  back.addEventListener("click", () => game.title());
  back.focus({ preventScroll: true });
}
