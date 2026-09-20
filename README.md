# INFERNO

A precision arcade time-trial racer for desktop browsers. Two circuits — a
suspended industrial figure eight and a desert proving ground — each with its
own three printing inks, its own boost pads and jumps, and a local
personal-best ghost.

## Run

```sh
npm ci
npm run dev
```

Open the local URL that Vite prints, normally <http://localhost:5173>. Use a
desktop browser with WebGL 2 and hardware acceleration. Every asset and font
is bundled locally. There is no account, no server and no API.

## Play

| Input              | Action                                              |
| ------------------ | --------------------------------------------------- |
| W / Up             | Accelerate; keep momentum in the air                |
| S / Down           | Brake and reverse; stop the pitch in the air        |
| A, D / Left, Right | Steer; oppose an airborne rotation                  |
| Space              | Second brake binding                                |
| R                  | Restart at once; a held throttle continues          |
| Backspace          | Respawn at the last checkpoint; the clock continues |
| G                  | Toggle the personal-best ghost                      |
| Tab                | Toggle the fixed split-time readout                 |
| C                  | Cycle Overview, Close and Interior                  |
| Numpad 1 / 2 / 3   | Select a camera directly                            |
| H                  | Toggle the head-up display                          |
| Enter              | Confirm, and expand a finished run                  |
| Escape             | Pause and resume; leave a finished run              |

Every attempt opens on the ready grid. Accelerate to start the clock, pass the
checkpoint gates in order, then cross the timing line forward. Build
steering at 191 km/h or more, then brake while you hold the throttle to
powerslide; release the brake or countersteer to recover grip. Keep the car
straight before a jump. A fall respawns at the last checkpoint and the clock
keeps running.

In the menus the arrows move the cursor where the screen says they will: up
and down run the column, left and right change a value or cross to the next
column, Q and E turn the pages of the settings book, Enter selects and Escape
goes back. Every screen prints those prompts along its bottom edge, named for
the keyboard or for the controller in your hands.

A standard gamepad works, with rebindable buttons. Bindings, display
preferences, records and ghosts stay in this browser. If storage is blocked,
the game continues with a session best and says so.

## The circuits

**Vertigo Works** is an elevated industrial figure eight of 3 451 m, driven in
four named movements. One move runs through all of them: the road turns about
its own axis and holds that attitude through a long constant-radius arc. The
climb stands it on edge for a wall ride, the helix holds one angle for a whole
revolution down a tower, the switchbacks lean through two linked hairpins on
the widest road of the lap, and the underworks carries it a full half turn
overhead before the long gap. Its crossing is separated by 192 m of height,
and the district below is built to the ground.

**Burnline** is a desert proving ground of 4 935 m in five sectors. Its road
is a line painted on a graded corridor up to 48 m wide, and the ground beside
the asphalt is a driving surface with less grip. A dry lakebed crossing, a
climb through the mesas, a canyon jump under a 58 m radar dish, a short
concrete channel between blast walls, and a kilometre of descending straight.
Three authored terrain cuts are worth about a second between them, and only if
they are entered properly.

Seven more circuit identities exist as palette previews. Their course geometry
is deliberately not implemented, and the interface refuses to start a run on
them.

## Source

```
src/main.ts     entry point
src/game/       race flow, input, screens, head-up display, storage
src/sim/        vehicle, contact, race rules, ghosts   — no DOM
src/track/      course schema, compiler and the selected course
src/render/     scene, cameras, course architecture, district, print pass
src/audio/      semantic events, synthesis, mix, spatial sources
src/ui/         circuit identities, timing, bindings, preferences
src/styles/     one stylesheet for each part of the interface
tools/audio/    offline sound-kit generation and analysis
```

The car uses custom arcade contact physics at a fixed 120 Hz, not a
general-purpose rigid-body engine. There is no multiplayer, no opponent, no
track editor, no online leaderboard, no mobile control scheme and no licensed
soundtrack.

`dist/` is the production build. Serve it from any static host. The fonts come
from Fontsource under their included open font licences; every other asset is
generated in code.

## Documentation

| Document                                   | Subject                                      |
| ------------------------------------------ | -------------------------------------------- |
| [Architecture](docs/architecture.md)       | Layers, directories and the frame            |
| [Handling](docs/handling.md)               | The driving model and its constants          |
| [Track authoring](docs/track-authoring.md) | How to write and verify a course             |
| [Vertigo Works](docs/environment.md)       | The circuit, its structures and its district |
| [Burnline](docs/burnline.md)               | The desert circuit, its lane and its cuts    |
| [Rendering](docs/rendering.md)             | The three inks and the print pass            |
| [Interface](docs/interface.md)             | Screens, display, controls and storage       |
| [Sound](docs/audio.md)                     | Events, synthesis, mix and verification      |
| [Verification](docs/testing.md)            | Every suite and how to run it                |
