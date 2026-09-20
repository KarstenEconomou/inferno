# Sound

Every sound in the game is generated. The project contains no recording, no
commercial sample, no preset and no external music. Game code emits a semantic
event such as `vehicle.land`; it never names a file, a frequency or a gain.

## Structure

| Module            | Role                                                               |
| ----------------- | ------------------------------------------------------------------ |
| `model.ts`        | Events, recipes, buses, the 128 BPM grid, telemetry mapping        |
| `themes.ts`       | One timbre set for each of the five circuit identities             |
| `synthesis.ts`    | Every primitive: percussion, bass, pluck, noise and stab           |
| `kit.ts`          | Bank loading, and the procedural fallback                          |
| `director.ts`     | Graph, voice pool, continuous layers, spatial sources, diagnostics |
| `layers.ts`       | Continuous oscillator and noise layers                             |
| `drivetrain.ts`   | Speed and load to layer levels                                     |
| `harmony.ts`      | Scale and tuning helpers                                           |
| `event-policy.ts` | Voice limits, priority and event gain                              |
| `debug.ts`        | Development-only audition lab                                      |

## Generation

`npm run audio:generate` writes 220 WAV masters at 48 kHz and 24 bits to
`tools/audio/sources/`, and five PCM banks of about 788 KiB each with a manifest to
`public/audio/`. Generation is deterministic: a repeat run gives a manifest
and bank hashes that are byte-identical.

The masters are development sources. Only the runtime banks reach the built
site. Every bank preloads at startup. A resident procedural kit covers every
Vertigo event and the immediate interface vocabulary of every theme, so a cold
or offline start still works. A failed bank request builds the same kit
locally instead of disabling the race. No gameplay event performs a fetch or
an asynchronous decode.

## Transport and mix

The grid is 128 BPM: a quarter of 468.75 ms, an eighth of 234.375 ms, a
sixteenth of 117.1875 ms and a bar of 1 875 ms. It follows the audio clock and
a restart does not reset its phase. Event attacks start at the current audio
time. The rare infrastructure cycles and the internal tails of sounds use
subdivisions. Boost follows the pad activation directly, without grid pulses.

The buses are MASTER, MUSIC, VEHICLE, GAMEPLAY, ENVIRONMENT and UI. The player
sees five sliders — Master, Music, Vehicle, SFX and Ambience — and a mute. A
27 Hz high-pass removes unusable low-frequency energy, and a restrained
compressor protects the output.

One-shot voices have a ceiling of 16, per-event limits, cooldowns and
priority-based stealing. The interface has a ceiling of two. The number of
continuous layers is fixed.

A pause attenuates the world buses through audio-time automation, so it works
even when the animation frames stop in a background tab. The interface stays
crisp. A finish ducks the vehicle and the ambience, and a restart cancels that
signal at once.

## The drivetrain

The vehicle simulation has no engine, no RPM and no gearbox, so the drivetrain
model is explicitly synthetic. It never claims physical engine telemetry.

Vertigo tunes its stack to G♯ minor:

| Voice           | Frequency       | Behaviour                               |
| --------------- | --------------- | --------------------------------------- |
| Body            | G♯0 / 25.96 Hz  | Low foundation retained at high speed   |
| Low register    | G♯1 / 51.91 Hz  | Dominant driven growl at every speed    |
| Middle register | G♯2 / 103.83 Hz | Adds the same sawtooth grain with speed |
| Upper register  | G♯3 / 207.65 Hz | Quiet rough edge, below the low voice   |

Speed sets the balance between the registers. The throttle sets the urgency
and one short accent on application. The load sets the weight and the
saturation. A constant input gives a constant result: there is no tremolo, no
amplitude modulation, no periodic filter movement and no stepped melody.
At maximum speed the low voice retains 75% of its low-speed gain and the
body retains 78%. Both upper voices use the same filtered, saturated waveform
as the low register, so acceleration keeps its mechanical character.

In the air, the car keeps the quieter, unloaded low drivetrain. Losing contact
removes weight instead of adding a high note. A landing restores the coupling
and emits a chassis hit scaled by the impact.

## Boost, braking and drifting

A boost begins with one warm 1.2-second synth line: a root and fifth, a rounded
9 ms attack, and a 320 ms exponential decay. A restrained third- and fifth-harmonic
edge adds grain to the onset at essentially the same level. These partials decay
over 176 ms, so the sustained fifth and root form a cleaner, rewarding tail.
The quiet tail extends beyond the 900 ms boost. Boost has no filtered-noise
layer; its exit is a quiet, short tonal release. Boost does not raise engine
gain, filter cutoff or distortion; the drivetrain continues to follow actual
speed and throttle. No periodic boost events are scheduled. The legacy
`vehicle.boost.loop` event previews the same synth decay quietly in the lab.

Braking adds a low triangle synth with an 18 ms attack. A mild cubic waveshaper
adds steady harmonic rasp (grain amount 0.32, with 2x oversampling). Pitch,
brightness and level fall with forward speed; the 65 ms release softens pedal
lift. The low register and continuous envelope suggest resistance rather than
a reward or impact. There is no retriggered chatter. The reverse control only
makes this tone while slowing forward motion.

Drifting adds a warmer triangle synth that grows brighter and slightly higher
with measured slip and fades as grip returns. Both voices use softly shaped
harmonics instead of filtered noise, with target pitches in the theme's scale
where one is defined. Brake and tire layers are silent at rest and leave within
milliseconds when contact is lost. The slide voice stays smoother than the
brake and rail-contact voices, keeping their meanings distinct.

The game sends the simulation's accepted drift setup, active slide and
recovery state to audio. Holding throttle and brake through these states keeps
the engine loaded, without the straight-braking synth. Lifting the
throttle restores the braking sound immediately.

## Contact

The impact strength comes from the velocity of the simulation into the rail.
It is a severity proxy, not structural acoustics.

Collision uses the same harmonic synth vocabulary as braking and boost, with
a short, low, single-note knock instead of the boost's sustained interval.
The body sits one octave below the boost root. A 1.5 ms attack makes contact
immediate, while a small pitch deflection settles with a 7 ms time constant. Brief phase modulation
and odd partials give the onset a metallic edge; the tail returns to the theme's
root. There is no noise burst, relay click, explosion or repeated impact loop.

The three pre-rendered variants are severity articulations, selected by strength
rather than round-robin. Light contact has a muted 37 ms body decay; medium
contact uses 54 ms; a hard hit has a rougher onset and a 75 ms body decay. Each
buffer is at most 280 ms. Runtime gain scales linearly with impact strength in
every theme, and strength also sets a fixed 550–2650 Hz low-pass cutoff and a
short release. Small hits thus stay short and dark; large hits gain weight and
edge without turning into a louder version of the same clank.

Rail scraping is a continuous, rougher triangle synth (grain 0.55). Its low-mid
pitch, brightness and level follow retained sliding speed. It starts with the
contact and ends promptly when contact or motion is lost. No periodic scrape
one-shots are scheduled; the legacy scrape event is a tonal lab preview. The
collision knock identifies contact onset, and this quieter rasp communicates
continued friction without masking steering feedback.

- A head-on collision removes the forward momentum, and the audio follows the
  resolved velocity. For 90 ms after an impact the gain and the filter use an
  8 ms time constant, so the upper registers leave at once.
- With the throttle held against a wall, the car keeps a dark, loaded low
  drivetrain. There is no invented free-spinning RPM and no engine stall.
- A stationary contact makes no sliding scrape.
- A glancing impact keeps tangential motion, so a quieter impact continues
  into a speed-dependent scrape.

## Spatial environment

Vertigo places three sources at its landmark sequences: cantilever relays,
rib-vault ventilation and pipe-bridge hydraulics. They use the same track
frames and widths as the visible structures, with distance attenuation, and
the listener follows the car. A quiet low bed and filtered air stay underneath.
A rare machinery pulse references a bar boundary, and only when an actual
source is within 120 m. No spatial source exists for an unbuilt circuit.

## Development lab

Open `http://localhost:5173/?audio` in development. The lab triggers every
event, selects a theme, mutes and solos buses, and reports the voice count,
the active layers, the master peak, the synthetic vehicle parameters, the
transport phase and the reported base latency. RECORD OUTPUT captures the
generated mix only, never a microphone.

`window.__infernoAudio` exists only on that opt-in page. The production build
omits the lab and its import.

Reported `baseLatency` describes the processing to the host audio subsystem.
It is not a measured speaker-to-ear latency.

The automated browser tests use the virtual sink of Chrome
(`sinkId: { type: "none" }`), so the real graph renders whether or not the
host has an output device. This is a test fixture, not a player setting.

## Listening files

- [Harmonic grit and collision revision](audio/grit-and-collision.m4a), with
  [cue times and rendered graph states](audio/grit-and-collision.json). This is
  the current isolated driving mix: brake grain, decaying boost, powered slide,
  light/medium/hard collision knocks, and sustained rail contact.

- [Engine, boost and braking revision](audio/driving-feedback.m4a), with
  [cue times and rendered graph states](audio/driving-feedback.json). This is
  an earlier isolated driving mix, before the synth stab and tire tones.

Earlier listening studies use the previous mix:

- [Drivetrain, airborne and wall-contact study](audio/drivetrain-study.m4a),
  with [cue times](audio/drivetrain-study-cues.json).
- [Complete lap](audio/clean-lap.m4a): browser output through both jumps, the
  boosts, the checkpoints and the finish.
- [Contact study](audio/contact-study.m4a): clean driving, excessive slip,
  impact and scrape, airborne and landing.
- [Isolated event kit](audio/vertigo-kit.m4a), with
  [cue times](audio/vertigo-kit-cues.json). The reel uses one preview gain;
  the gameplay recordings use the actual mix.

Regenerate the kit with `npm run audio:generate`. Build the listening sheet
with `node tools/audio/audition.ts /tmp/inferno-vertigo-kit.wav`.

## Reference measurements

The tuning references aggregate measurements of a recording that stays
outside the project. The measurements hold statistics only: no audio and no
transcription.

- Section tempo: 127.92 – 128.22 BPM.
- Strongest tonal centre: G♯. The clearer harmonic section favours G♯ minor,
  with a profile correlation of 0.794 against 0.735 for major.
- Clear upper tonal peaks sit near A440 equal temperament.
- Low-band stereo side energy is 36.8 dB below mid, so the game keeps a mono
  foundation and reserves width for actual environment sources.

Files: [sections](audio/reference-measurements.json),
[harmonic peaks](audio/reference-harmonic-measurements.json),
[envelope and stereo](audio/reference-envelope-measurements.json).

The analysis scripts and their isolated Python requirements are in
`tools/audio/analysis/`. They are not runtime dependencies, and neither
generator takes reference audio as input.

## Measured output

The current [driving-feedback capture](audio/driving-feedback-measurements.json)
peaks at −16.59 dBFS in stereo, with no clipped or non-finite samples. The
browser checks also exercise the actual powered drift through keyboard input,
and verify that boost schedules no repeated pulses.

The following full-mix and contact measurements predate the engine, boost and
braking revision:

- The sweep of every event across every theme peaks near 0.132 linear
  (−17.6 dBFS) and uses at most 6 simultaneous voices against the cap of 16.
- A captured full mix measures −13.69 dBFS peak and −32.93 dBFS RMS, with no
  clipping and no non-finite sample.
- In the contact study, steady scraping is about 2 dB quieter overall than
  clean driving, while energy above 1.5 kHz rises about 5.4 dB. The roughness
  is therefore spectral, not a change of volume. The airborne segment drops
  about 11.7 dB.

These are sample-level measurements. They are not an integrated loudness
figure and they do not establish a perceptual judgement.
