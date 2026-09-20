# Handling

The car uses custom arcade contact physics, not a general rigid-body engine.
The simulation runs at a fixed 120 Hz. World velocity is authoritative: no
rule imposes a speed target or aligns the heading to the velocity.

Every handling constant is in `src/sim/handling.ts`, in metres, seconds and
radians. Handling changes require an explicit `TRACK_VERSION` bump in the
track facade; `handling-15` invalidates records and ghosts from earlier rules,
including the previous oversized boost-pad triggers.

## Input

`Input` holds three values: `throttle`, `steer` and `brake`. Slip, drift
phase, readiness, the wheel mask and the axle loads are derived telemetry, not
inputs.

| Control            | Action                                                      |
| ------------------ | ----------------------------------------------------------- |
| W / Up             | Throttle. In the air it keeps momentum without thrust.      |
| S / Down, Space    | Brake and reverse. In the air it stops the pitch.           |
| A, D / Left, Right | Steer. In the air it opposes a rotation that already turns. |

## Ground contact

Four probes match the rendered wheels: 1.30 m to the front axle, 1.35 m to the
rear axle and 1.065 m of half track. Each probe reports support, load and
compression. Partial support continues at a lip until the remaining wheels
release.

The road is a twisted ribbon, so the contact plane comes from the actual
surface normal at the lateral offset of each wheel, not from the centreline.
Momentum rotates with that plane and keeps its length. Gravity and downforce
act in the plane of the road, so a car can drive a wall ride, a vertical loop
and an inverted section. Contact breaks when the load turns negative, which
happens when the car is too slow on a ceiling.

## Drift

Normal driving uses firm lateral response at both axles. Steering builds at
12 /s; releasing or reversing the input responds at 20 /s. The slightly
smaller steering angle keeps high-speed keyboard corrections manageable.

Steering and lateral load prepare a slide over roughly 0.3 s. Throttle plus
steering and brake at entry speed starts a powered request immediately, even
when brake is pressed early or alongside steering. Preparation continues while
those controls are held; it cannot become stuck braking below the entry speed.
The request survives small speed changes, and clears on neutral steering,
countersteering, releasing either pedal, flight or reset. Readiness measures
steering response relative to the requested input, so half-stick corners can
prepare without requiring full controller lock.

Braking progressively reduces both axles' lateral response, with a stronger
rear reduction. Retaining rear authority and letting the front slide produces
a sustained arc instead of rapidly pivoting the chassis. The force blend has
a smooth 0.25 s ramp. A valid throttle-held drift uses full engine thrust
without longitudinal braking through preparation, entry and recovery. Brief
neutral or countersteering corrections retain engine drive as grip returns.
Lifting throttle while holding brake restores full braking. Straight and
below-entry-speed braking still work normally.
Once entry starts, dropping below entry speed does not interrupt that ramp.

Each axle measures the slip at its contact point from the world velocity and
the yaw rate. A lateral impulse opposes that slip, and the lever arm of the
axle turns that impulse into yaw. There is no target slide angle, no drift
charge and no speed reward. During a controlled slide, 15% of the tire-work
loss becomes scrub; the rest redirects momentum. The integration budgets both
translation and yaw energy, so steering cannot add mechanical energy. This
retention continues through recovery, avoiding a braking sensation on release.
Beyond 35° of slip, scrub rises progressively back to the full loss at 70°.

| Setting                                    | Value                            |
| ------------------------------------------ | -------------------------------- |
| Slide entry speed                          | 53 m/s (191 km/h)                |
| Steering / return response                 | 12 / 20 /s                       |
| Slide readiness                            | 0.84; load reference 14 m/s²     |
| Slide transition / grip recovery           | 0.25 s / 0.35 s                  |
| Countersteering recovery                   | 0.2 s while opposing slip        |
| Lowest speed that sustains a slide         | 12 m/s                           |
| Grip front / rear lateral response         | 42 / 46 /s                       |
| Sliding front / rear lateral response      | 8 / 4.2 /s                       |
| Sliding front / rear acceleration capacity | 45 / 40 m/s² before load scaling |
| Controlled sliding scrub fraction          | 0.15                             |
| Yaw inertia, normalised by mass            | 2.8 m²                           |

Hold brake to maintain a tighter arc. Release it to recover grip over 0.35 s:
the tires first bring travel toward the chassis direction, then the line
opens. Reapply brake while slip remains to extend the drift, even below entry
speed. Countersteering recovers faster, and straightening also ends the slide.
Landing grip recovery has its own unchanged 0.35 s setting. Straight braking
takes priority and cannot improve acceleration.

The unbounded flat-road regression in `tests/handling.test.ts` uses real wheel
probes and free movement. Keyboard reversals change velocity curvature after
0.067–0.075 s at 35–70 m/s, compared with 0.167–0.175 s before this tune.
A four-second full-lock drift from a 60 m/s approach settles around 15.6° of
slip and 66.7 m/s (240 km/h), with a peak yaw rate below 2.2 rad/s. Handling-12
settled near 39.6 m/s (143 km/h). These are measured responses, not imposed
slide angles or yaw limits.

From the same 60 m/s entry into the third-sector hairpin, the regression in
`tests/corner.test.ts` measures:

| Line                              | Time    | Exit speed | Rail hits |
| --------------------------------- | ------- | ---------- | --------- |
| Brake only                        | 3.467 s | 54.901 m/s | 0         |
| Throttle, steering and brake held | 2.308 s | 83.168 m/s | 0         |

## Engine and boost

Thrust is a quadratic function of forward speed. It starts at 18 m/s² and
falls to the resistance force at 85 m/s (306 km/h). That speed is an
equilibrium, not a limit: gravity or an earlier boost can carry the car past
it, and the extra momentum then decays through drag.

| Measurement | Time    |
| ----------- | ------- |
| 0–100 km/h  | 1.808 s |
| 0–200 km/h  | 4.158 s |
| 0–250 km/h  | 6.108 s |

A boost pad starts 0.9 s of engine overdrive: 80 m/s² of thrust and a 94 m/s
(338 km/h) equilibrium. The pad never assigns a speed. Staying on a pad does
not trigger it again, and re-entry refreshes the interval instead of adding a
second one. A reverse crossing does not activate a forward pad. The pulse only
acts through the grounded drivetrain. Straight braking takes priority over
boost; a valid powered drift retains the available engine thrust.

The trigger matches the outer rectangle of the visible chevrons, about
6.33 m wide by 8.67 m long. Rendering and physics share the same stripe
dimensions. The car's centre must lie inside that footprint on the pad's
surface, with current ground contact; passing beside or flying above it does
not trigger boost.

Checkpoints and the finish credit forward crossings over their local road
span even while airborne, including jumps above the gantry. Passes beside or
below the deck, reverse crossings and skipped checkpoints do not count.

| Entry at full throttle | Exit     |
| ---------------------- | -------- |
| 144 km/h               | 282 km/h |
| 252 km/h               | 317 km/h |
| 360 km/h               | 343 km/h |

A faster entry stays faster, and a car already above the boost equilibrium
slows smoothly. Expiry changes the available thrust; it removes no velocity.

## Flight

The launch attitude, the momentum and the recent chassis rotation carry into
the air. There is no launch kick and no recovery flip.

- The throttle keeps momentum. Releasing it adds 0.18 /s of drag.
- The brake removes the pitch component in one step, at the current attitude.
  It does not level the car, cancel gravity or change the trajectory.
- Steering damps a yaw or a roll that already turns, at 12 /s. It cannot start
  a rotation or steer the flight path.
- With no input, the rotation only decays at 0.12 /s.

A swept test of the chassis and of the four wheels finds the first contact
along the flight path, including a path that starts above a gap or ends just
past the landing platform. The car settles around the wheel that touched
first. A flat, aligned landing keeps tangential momentum; an uneven or
spinning landing loses more, and the tires then absorb the sideways slip.
Contact on a side or on the roof cannot engage grip: it absorbs the impact and
bounces clear.

## Rails

A grounded car stays on the deck. The rail removes the part of the momentum
that points into it and applies friction in proportion to that component, so
a glancing scrape keeps useful speed, including an inverted one. Contact never
steers the chassis.

An airborne car sweeps its footprint against both rails. An impulse away from
the centre pitches and rolls the chassis, and air control can correct the
attitude afterwards. A hard inverted impact can destroy the contact load; the
race then asks for a checkpoint recovery after 0.35 s. Recovery clears the
boost and the rotation, and keeps the elapsed time and the checkpoint
progress.

## Visible steering and cameras

The car’s rendered position and orientation use the same interpolation between
physics steps. There is no additional filter delaying the visible chassis yaw:
a short steering tap must turn the nose along with the path, rather than move
the car sideways while its body catches up.

`src/render/camera.ts` advances the camera at the 120 Hz of the simulation and
interpolates between two states for each rendered frame. It uses the
continuous road and chassis frame, so it stays correct through a vertical
tangent. A preset never changes by itself.

| Preset                 | Framing                                    |
| ---------------------- | ------------------------------------------ |
| 1 — Overview (default) | 12 m behind, 5 m above, follows the travel |
| 2 — Close              | 8 m behind, 3 m above, follows the chassis |
| 3 — Interior           | Driver eye, 0.73 m above the origin        |

C or RB cycles the presets, and numpad 1, 2 and 3 select one directly. The
selected preset persists and survives a restart. The settings expose a
vertical field of view from 55° to 85°, and an optional speed effect that is
off by default.

A grid of the actual course triangles supports a clearance sweep. The chase
distance shortens at once at a deck, a rail or a structure, and returns
gradually.

## Reference observations

The supplied [Trackmania 2020 gameplay](https://www.youtube.com/watch?v=VEe4e0OA67I)
provides a visual feel reference, not source physics or input telemetry. On map
01 around video 00:20–00:22, the race timer and HUD show roughly 0–100 km/h in
1.8 seconds. Around 11:40–11:44, map 21 carries roughly 240–265 km/h through
linked road slides, with modest speed changes rather than sustained heavy
braking. Later acceleration includes gradients and cannot define a flat-road
engine curve. The launch target and powered-slide behavior follow those
observations; this project’s solver and constants remain its own.

## Origin of the model

The behaviour follows the conventions of arcade stadium racing: turn before
braking with the throttle held, brake in the air to stop the pitch, and
countersteer a rotation that already turns. The constants and the solver are
specific to this project. No external solver, source or tuning data is
reproduced here.
