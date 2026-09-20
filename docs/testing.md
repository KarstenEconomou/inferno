# Verification

```sh
npm run typecheck   # TypeScript, no emit
npm test            # unit and regression suites in Node
npm run build       # typecheck and production build
npm run test:browser # Chrome, real input, full laps
```

## Unit and regression suites

`npm test` runs every file under `tests/`. The suites need no browser, because
the simulation, the course compiler and the sound synthesis are independent of
the DOM.

| Suite                     | Covers                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `acceleration.test.ts`    | Launch times, terminal equilibrium, boost entry and expiry                                           |
| `air-control.test.ts`     | Momentum, one-step pitch arrest, no powered rotation                                                 |
| `audio.test.ts`           | Grid, recipes, synthesis determinism, bank hashes, mix limits                                        |
| `burnline.test.ts`        | The desert course: lane containment, grip, cuts, the canyon, the graded bench, the fence, a full lap |
| `camera.test.ts`          | Preset framing, continuity, obstruction response, reset                                              |
| `contact.test.ts`         | Deck sweep, gaps, landings from below                                                                |
| `corner.test.ts`          | Drift against brake-only through the hairpin                                                         |
| `drift.test.ts`           | Entry conditions, recovery, energy                                                                   |
| `handling.test.ts`        | Flat-road reversal latency, powered drift speed retention, lift braking, passive energy, recovery    |
| `drivetrain.test.ts`      | Speed and load to sound layer levels                                                                 |
| `event-policy.test.ts`    | Voice limits, priority, event gain                                                                   |
| `feedback.test.ts`        | Driving advice and its hysteresis                                                                    |
| `gameplay.test.ts`        | Full simulated laps at several steering cadences                                                     |
| `intro-course.test.ts`    | Lesson windows and course markers                                                                    |
| `layout.test.ts`          | Course clearance, structures, district coverage and bounds                                           |
| `markers.test.ts`         | Rendered boost-pad bounds, activation edges, current contact and fast crossings                      |
| `playability.test.ts`     | Jumps at several speeds and lateral offsets                                                          |
| `precision.test.ts`       | Banked, vertical and inverted contact                                                                |
| `race.test.ts`            | Checkpoint order, ghost recording, respawn cuts, validation                                          |
| `sim.test.ts`             | Rails, tunnelling, branch selection, fixed-step independence                                         |
| `smooth-track.test.ts`    | Curve continuity, bank and grade transitions, exact lips                                             |
| `track-authoring.test.ts` | The compiler API, marker validation, deck segments                                                   |
| `ui.test.ts`              | Timing, bindings, history validation, circuit identities                                             |

`tests/driver.ts` holds a repeatable test driver. It supplies the same three
inputs that a player supplies, and it never moves the car directly. It is test
infrastructure, not a driving assist and not an optimal racing line. It builds
a speed profile: it reads the radius of the road at intervals out to its own
braking distance and takes the slowest speed each corner ahead still allows,
so the same corner is glanced at from slow and committed to from fast. Local
yaw is measured in the plane of the deck, so a coil of the helix reads as the
corner it is rather than as a reversal of heading. Drift lines account for the
retained corner-exit speed.

The flat-road handling fixture isolates tire behavior using real wheel probes
and unconstrained movement. It checks mirrored keyboard reversals, a continuous
four-second powered slide, early and simultaneous brake entry, corrections
with brake held, half-stick entry, smooth release and re-entry, excessive-angle scrub,
and monotonic passive mechanical energy. Track laps independently verify the
line, contact, boosts, jumps and collisions.

## Browser suite

`npm run test:browser` starts Vite if necessary and drives Chrome. It checks
the race controls and the preferences, then drives a full lap with real
keyboard events, verifies the checkpoint order, saves the best run, and checks
the ghost replay after a reload. Screenshots go to `test-results/`.
`handling.spec.ts` also measures visible chassis heading during short A/D taps
in both chase cameras, rejecting extra yaw lag beyond physics interpolation.

`ui.spec.ts` walks the menu cursor at two window sizes and asserts that it
goes where the screen says it will: a vertical press stays inside its lane and
wraps there, a horizontal press crosses columns or changes the value under the
cursor, and returning to the circuit list lands on the row it left. It also
turns the pages of the settings book with Q and E.

Camera comparisons schedule driving decisions against the simulation clock;
wall-clock timer drift must not change the line between camera presets. The
separate keyboard lap still uses browser keyboard events and real-time polling.

`tests/browser/physics.spec.ts` drives in real time and depends on timing. It
can be sensitive on a loaded machine.

## Visual capture

With the development server running:

```sh
npm run test:visual -- review            # Vertigo Works, 1280 x 720
npm run test:visual -- review-1080 1080  # Vertigo Works, 1920 x 1080
npm run test:visual -- burnline          # Burnline, 1280 x 720
npm run test:visual -- desert 720 burnline  # any name, on a named circuit
```

The circuit comes from the third argument, or from the name when it holds one.
Each circuit has its own list of views, because a view is named for the thing
it looks at, and the palette check uses that circuit's three inks.

The Vertigo capture records 36 fixed views, including the banked turns, the
helix, the inverted section, both crossing levels, the deck structures, the
district and the skyline. The Burnline capture records 25, including the
lakebed and its chord, the dirt apex, the canyon lip and its landing, the
concrete channel, both terrain cuts and the descent. It writes the images and a palette and draw-call
report to `/tmp/inferno-visual/<name>/`, and it fails on a browser error or on
any colour outside the three world inks.

`http://localhost:5173/tests/visual/scene.html` opens the same scene for
manual inspection, and `?circuit=burnline` opens it on the desert course. From the console, `inspectScene(0.258)` inspects the
overpass and `inspectScene(0.732)` inspects the underpass. Any normalised
progress works.

## Sound generation

```sh
npm run audio:generate
```

Generation is deterministic. A repeat run produces a manifest and bank hashes
that are byte-identical, and `tests/audio.test.ts` compares the synthesised
output against the committed bank.

## After a change to the course or the handling

1. `npm run test:track` for the authoring and clearance checks.
2. `npm test` for the full simulated laps, the jumps and the collisions.
3. `npm run test:visual -- <name>` and inspect the images. Geometry checks
   alone do not prove that a jump is driveable.
4. `npm run test:browser` for a real keyboard lap and a saved ghost.
5. `npm run build`.

Change the `id` of a course whenever its geometry changes, and raise
`TRACK_VERSION` in `src/track/index.ts` whenever the handling changes. Older
records and ghosts belong to their original course.
