# Interface

The flow is TRACKS → DRIVE → COMPARE → RESTART. Every attempt opens on the
ready grid. The throttle starts the clock; there is no countdown. To leave the
game, close the tab.

`src/ui/` holds the model: the circuit identities, the lap-time arithmetic,
the bindings and the display preferences. It has no knowledge of the
simulation or of the renderer. `src/game/screens/` builds the markup and wires
the controls; `src/game/screens/chrome.ts` holds the parts that every screen
shares.

## The frame

Every full screen is built from the same three bands.

| Band        | Content                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| Title bar   | The wordmark, the name of this screen, one line of context              |
| Screen      | The screen itself, in columns                                           |
| Command bar | What each control does here, named for the device in the player's hands |

The command bar is the only place that promises anything about the controls,
and it never promises something the screen cannot do: the START prompt on the
track sheet is withdrawn while an unbuilt circuit holds the cursor. Picking up
a controller rewrites every prompt in place, so no prompt names a device that
is not in use.

Dialogs — pause, settings and the result sheet — use the same command bar
inside a panel, over a halftone of the road.

## Screens

| Screen  | Content                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| Title   | TRACKS, RECORDS and SETTINGS, a line of copy for the row under the cursor, and what this browser has saved. |
| Tracks  | The circuit list, the sheet of the circuit under the cursor, and its plan.                                  |
| Records | Personal best, session best, best sectors and the last eight laps.                                          |
| Drive   | The head-up display over the road.                                                                          |
| Pause   | Resume, restart, ghost, track, settings and quit, beside the state of the held run.                         |
| Results | The full sector table, only when the player asks.                                                           |

The track order is Vertigo Works, Burnline, Karst, Containment, Terminal Zero,
The Spillway, Frostline, Intermodal and Afterimage. `src/circuits.ts` holds
their supplied taglines, identity, mastery, character and named tritone
palettes. Containment uses “Hazardous.” Vertigo Works and Burnline have
course geometry; the other seven remain identity previews and cannot start a
run.

The track sheet reports length, splits, boost pads, jumps, personal best and
the three demands of the circuit, then names its features and its timed
sectors. It is drawn for the circuit under the cursor, whose course is
compiled on its own to be read; the personal best is shown only for the
circuit that is built, because that is the only one whose records are
loaded. A circuit without a course reports none of it. Demand is a reading of
a road that exists, so a preview states no demand rather than a guess at one,
and its sheet keeps the shape and the columns of a built one with the figures
blank — no borrowed numbers, and no marker standing in for a drawing it does
not have. Every drawing of a course carries its timing line and all of its
checkpoints, in the order the road meets them: on the sheet the line is filled
and the checkpoints are left open, and on the pause plan a gate fills as the
run passes it. Only the car is optional, because only a held run has one.

Empty timing sheets keep their rows and print a blank time in each, so a sheet
reads as a form that the player fills in rather than as a missing table.

## Moving

The cursor is chosen from the screen, not from the order of the markup. A
press picks the nearest control past the current control's edge, preferring
one in the same lane — a column of rows, or a row of plates. A lane wraps
round at both ends and never wraps into another lane, so a press can only move
the cursor the way it points, or round the lane it already stands in. Folding
a layout at a narrow window therefore changes the navigation with it, because
both come from the same geometry.

A list that the cursor leaves and returns to, such as the circuit list,
remembers where it stood: crossing to the plates beside the sheet and back
returns to the row that was left, so the selected circuit cannot change by
accident.

| Press     | Effect                                                    |
| --------- | --------------------------------------------------------- |
| ↑ ↓ / W S | The next control up or down the lane                      |
| ← → / A D | The value of the row under the cursor, or the next column |
| Q / E     | The previous or next page of the settings book            |
| Enter     | Select. On the track list it starts the run               |
| Escape    | Back, resume, or leave a finished run                     |

On the circuit list the cursor is the selection: moving it changes the sheet,
the plan and the colours of the whole interface at once.

## Settings

Settings is a book of seven pages — DISPLAY, CONTROLS, CAMERA, AUDIO, GHOST,
VIDEO, RULES — and it opens on the first. The shoulder buttons and Q / E turn
the pages; the tab strip shows which page is open and can be clicked, but the
cursor never lands on it. Inside a page the cursor runs down the rows, the
horizontal arrows change the value of the row it holds, and the line under the
rows explains that row.

CONTROLS is one row for each action with its key beside its button, so a
horizontal press crosses between the two and a vertical press runs down a
column. Selecting a cell listens for the next key or button. A new binding
that collides with another action exchanges the two, so no action becomes
unreachable.

Every control saves the moment it changes; the panel has no confirm step.

## Head-up display

The race view has three fixed corners:

- Top left: lap time, then split time, each under the label that names it.
  Comparisons use a signed number only, and take the ink of their own side of
  the reference lap; without a reference lap, a checkpoint shows its
  cumulative time.
- Bottom left: the name of the circuit, the plan of it with the gates and the
  car's own mark on it, then the split counter and one bar per split,
  including the final split. Completed bars use signal ink, the current bar
  uses structure ink and is taller, and upcoming bars remain outlined. Every
  bar has an accessible state label. The map is the same outline the track
  sheet and the pause plan draw, and only the car's mark moves: it is written
  as one transform, and only when the value it prints has changed.
- Bottom right: a strip that fills with the car's speed, then speed in km/h,
  with `REV` only while reversing.

Nothing frames a corner and nothing is printed on a panel. The display sits
straight on the road, so it prints in signal ink and keeps structure for the things that mean something:
the sector being driven, a split behind the reference, and reverse. This is
the one place the interface reverses its label and value inks, because the
city behind the display is itself drawn in structure.

Every readout inherits one size, 26 px at standard desktop widths and at least
20 px at narrower widths, before applying the player's HUD scale; the labels
print at a fraction of it. No hotkey strip, boost/jump label, driving advice,
launch prompt, checkpoint popup, camera toast or automatic finish banner
appears over the road.

The timer remains visible and locked after the finish. The car stays driveable
until Enter opens results; R retries and Escape returns to track selection.
Results still contain the split table, opened only on request.

DISPLAY settings control lap time, split time, comparison to best, split
progress, speed, scale and safe zone. Tab toggles the fixed split-time
readout. Saved hotkey-hint preferences from older builds are ignored.

Every circuit uses the same palette roles throughout the interface: field
for backgrounds, structure for graphic elements, borders and every label,
signal for the values those labels name and for highlights; the head-up
display reverses the last two, for the reason given with it. The three inks are
printed flat and never blended: no tint, wash or screen of one ink stands in
for a fourth. Every button in the interface carries the same registration edge — four
pixels of structure ink down its left side — whether it is a row of the escape
menu, a plate under the track sheet, a circuit in the list or a page of the
options book. Selected controls invert to field text on signal and keep that
edge by printing it in field ink, so it survives the inversion instead of
vanishing into the fill. The pointer only offers a
row, by lighting its frame, so the player never sees two selected rows at
once. Karst follows these exact rules with Concrete Grey, Asphalt Charcoal and
Iron Oxide.

## Controls

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

The arrow keys work for driving only while the matching WASD action still
holds its default key and no action claims that arrow. A finished run stays
driveable with every driving key until the result sheet opens.

A standard gamepad has rebindable buttons, shown in the controls page. The
direction pad and the left stick both move the cursor, one step to a push; A
selects, START goes back, and the shoulder buttons turn the pages of the
settings book. Left-stick steering stays available beside the rebindable
steering buttons. Confirm and the secondary brake share the A button, because
their contexts never overlap.

## Storage

Everything stays in this browser. There is no account and no server.

| Key                                | Content                         |
| ---------------------------------- | ------------------------------- |
| `inferno-best:<circuit>:<version>` | The personal best and its ghost |
| `inferno-history:<version>`        | The last 50 completed laps      |
| `inferno-settings`                 | Preferences for every circuit   |

The personal best is namespaced by circuit identity and physics version, with
a fallback read of the older unnamespaced key. A saved binding set merges into
the defaults one action at a time, so an older save stays usable when a new
action appears.

If storage is blocked or full, the game continues with a session best and says
so. Losing the window focus pauses an active run.
