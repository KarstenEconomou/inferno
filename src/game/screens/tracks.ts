import { courseFor } from "../../track";
import { circuits, format } from "../../ui";
import type { Game } from "../game";
import { block, legend, meter, MOVE_ANY, head, stat } from "./chrome";
import { row } from "./markup";

/** Course features, in the order that the road meets them. */
const FEATURE_NAMES: Record<string, string> = {
  wallride: "WALL RIDE",
  loop: "LOOP",
  helix: "HELIX",
  inverted: "INVERTED",
  hairpin: "HAIRPIN",
  sweeper: "SWEEPER",
  jump: "JUMP",
  "terrain-cut": "TERRAIN CUT",
};

const metres = (value: number) =>
  Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** The data sheet of one circuit. Only a built course can report course
 * numbers, the demand it makes on the driver, its features or its sectors; a
 * preview keeps the shape of the sheet with those figures blank. */
function card(game: Game) {
  const c = circuits[game.selectedCircuit];
  // A sheet is drawn for the circuit under the cursor, which is not always
  // the circuit that is built. Its course is compiled on its own to be read.
  const course = c.available ? courseFor(c.id) : null;
  const track = course?.track;
  const chips = (items: string[]) =>
    `<div class="chips">${items
      .map((name) => `<span class="chip">${name}</span>`)
      .join("")}</div>`;
  // One chip per kind of feature, in the order the road meets them. A course
  // that uses a feature twice still names it once.
  const features = [
    ...new Set(
      (track?.features ?? []).map(
        (f) => FEATURE_NAMES[f.kind] ?? f.kind.toUpperCase(),
      ),
    ),
  ];
  const sheet =
    course && track
      ? stat("LENGTH", `${metres(course.length)} M`) +
        stat("SPLITS", String(track.checkpoints.length + 1)) +
        stat("BOOST PADS", String(track.boosts.length)) +
        stat("JUMPS", String(track.gaps.length)) +
        stat(
          "BEST LAP",
          game.best && game.loadedCircuit === c.id
            ? format(game.best.time)
            : "—:—.———",
        )
      : stat("LENGTH", "—") +
        stat("SPLITS", "—") +
        stat("BOOST PADS", "—") +
        stat("JUMPS", "—") +
        stat("BEST LAP", "—:—.———");
  // The plate states the circuit's condition and nothing else. Its splits and
  // its boost pads are counted on the sheet below, and it names that condition
  // with the same two words the list beside it uses.
  return `<h1>${c.theme.display_name}</h1><p class="track-tagline">${c.tagline}</p><p class="mono track-status ${
    c.available ? "ready" : "locked"
  }">${c.available ? "READY" : "NOT BUILT"}</p><div class="card-columns">${block("COURSE DATA", sheet)}${
    // The data keeps its column whether or not a demand stands beside it, so
    // the sheet holds its shape as the cursor steps down the list.
    c.grade
      ? block(
          "DEMAND",
          meter("SPEED", c.grade.speed) +
            meter("TECHNICAL", c.grade.technical) +
            meter("AIR", c.grade.air),
        )
      : ""
  }</div>${
    track
      ? `<div class="card-columns">${block("FEATURES", chips(features))}${
          track.sectors
            ? block(
                "SECTORS",
                chips(track.sectors.map((s, i) => `0${i + 1} ${s.name}`)),
              )
            : ""
        }</div>`
      : ""
  }`;
}

/** Track selection. The list is one column and the sheet is the next, so a
 * vertical press stays in the list and a horizontal press crosses to the
 * sheet and its actions. Only circuits with authored geometry can start a
 * run; the others show their identity and stay unavailable. */
export function showTrackSelect(game: Game) {
  const built = circuits.filter((c) => c.available).length;
  game.ui.innerHTML = `<section class="screen selection track-selection" data-screen="tracks">${head(
    ["TRACKS"],
    `${String(built).padStart(2, "0")} OF ${String(circuits.length).padStart(2, "0")} BUILT`,
  )}<div class="screen-body tracks-body"><nav class="circuit-selector" data-cursor-group aria-label="Select circuit"><h2 class="block-title label list-title">CIRCUIT<b class="mono" id="circuit-index">${String(
    game.selectedCircuit + 1,
  ).padStart(
    2,
    "0",
  )}/${String(circuits.length).padStart(2, "0")}</b></h2>${circuits
    .map(
      (circuit, i) =>
        `<button class="circuit-option ${i === game.selectedCircuit ? "selected" : ""}" data-circuit="${i}" aria-pressed="${i === game.selectedCircuit}"><span class="mono">${String(
          i + 1,
        ).padStart(
          2,
          "0",
        )}</span><strong>${circuit.theme.display_name}</strong><small>${
          circuit.available ? "READY" : "NOT BUILT"
        }</small></button>`,
    )
    .join(
      "",
    )}</nav><div class="track-sheet"><div class="track-copy" id="track-card">${card(
    game,
  )}</div><div class="track-action"><div class="track-action-buttons" data-cursor-group>${actionPlates(
    game.selectedCircuit,
  )}</div></div></div><div class="track-graphic" aria-hidden="true" id="track-graphic">${graphic(game)}</div></div>${legend(
    game,
    [
      MOVE_ANY,
      { action: "confirm", label: "START", id: "start" },
      { action: "menu", label: "BACK" },
    ],
  )}</section>`;
  for (const button of game.ui.querySelectorAll<HTMLButtonElement>(
    ".circuit-option[data-circuit]",
  )) {
    const index = Number(button.dataset.circuit);
    button.addEventListener("focus", () => selectCircuit(game, index));
    button.addEventListener("click", () => selectCircuit(game, index));
  }
  bindActions(game);
  game.ui
    .querySelector(".cue-start")!
    .classList.toggle("hidden", !circuits[game.selectedCircuit].available);
  game.ui
    .querySelector<HTMLButtonElement>(
      `.circuit-option[data-circuit="${game.selectedCircuit}"]`,
    )!
    .focus({ preventScroll: true });
}

/** The plan of the course. A circuit with no geometry shows nothing rather
 * than a stand-in for the drawing it does not have yet. */
const graphic = (game: Game) =>
  circuits[game.selectedCircuit].available
    ? game.planOf(circuits[game.selectedCircuit].id).svg("course-map")
    : "";

/** The two plates under the sheet. DRIVE is absent for an unbuilt circuit,
 * so the cursor cannot land on a run that cannot start. */
const actionPlates = (index: number) =>
  `${
    circuits[index].available
      ? row("drive", "DRIVE")
      : '<button class="menu-row" disabled><span class="row-label">UNAVAILABLE</span></button>'
  }${row("back-title", "BACK")}`;

function bindActions(game: Game) {
  game.ui
    .querySelector("#drive")
    ?.addEventListener("click", () => game.start());
  game.ui
    .querySelector("#back-title")
    ?.addEventListener("click", () => game.title());
}

/** Step to another circuit. Only the sheet, the map and the row states change,
 * so the cursor never loses its place in the list. */
export function selectCircuit(game: Game, index: number) {
  if (!game.ui.querySelector(".track-selection")) {
    game.selectedCircuit = index;
    game.trackSelect();
    return;
  }
  if (game.selectedCircuit === index && game.ui.querySelector("#track-card"))
    return;
  game.selectedCircuit = index;
  game.applyCircuitTheme();
  for (const button of game.ui.querySelectorAll<HTMLButtonElement>(
    ".circuit-option[data-circuit]",
  )) {
    const selected = Number(button.dataset.circuit) === index;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  game.ui.querySelector("#circuit-index")!.textContent =
    `${String(index + 1).padStart(2, "0")}/${String(circuits.length).padStart(2, "0")}`;
  game.ui.querySelector("#track-card")!.innerHTML = card(game);
  game.ui.querySelector("#track-graphic")!.innerHTML = graphic(game);
  // A circuit without a course cannot be started, so the prompt that offers
  // it is withdrawn rather than left to fail.
  game.ui
    .querySelector(".cue-start")!
    .classList.toggle("hidden", !circuits[index].available);
  const actions = game.ui.querySelector(".track-action-buttons")!;
  // Keep the cursor on the same plate when an unbuilt circuit removes DRIVE.
  const held = [...actions.children].indexOf(document.activeElement!);
  actions.innerHTML = actionPlates(index);
  bindActions(game);
  if (held >= 0) {
    const plates = [
      ...actions.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ];
    (plates[held] ?? plates.at(-1))?.focus();
  }
}
