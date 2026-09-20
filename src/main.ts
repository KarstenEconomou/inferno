/** Entry point. It creates the renderer and the game, shows the title screen
 * and starts the frame loop. Everything else lives in the modules below. */
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/barlow-condensed/latin-900-italic.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles/index.css";
import { Game } from "./game/game";
import { World } from "./render/world";

const ui = document.querySelector<HTMLDivElement>("#ui")!;
let world: World;
try {
  world = new World(document.querySelector<HTMLCanvasElement>("#game")!);
} catch (error) {
  ui.innerHTML =
    '<div class="overlay"><div class="panel"><h2>ENGINE OFFLINE</h2><p>This game needs WebGL 2. Try a desktop browser with hardware acceleration enabled.</p></div></div>';
  throw error;
}

const game = new Game(ui, world);
game.title();
if (import.meta.env.DEV && new URLSearchParams(location.search).has("audio"))
  void import("./audio/debug").then(({ mountAudioLab }) =>
    mountAudioLab(game.sound),
  );
requestAnimationFrame(game.loop);
Object.defineProperty(window, "__inferno", { get: () => game.diagnostics });
