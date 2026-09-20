/** Stable entry point for the sound system. Game code emits meaning, never
 * file names or frequencies.
 *
 * Every relative import inside this directory states the .ts extension. The
 * offline generator in tools/audio loads these modules directly in Node,
 * which needs a complete specifier. */
export { AudioDirector, AudioDirector as Sound } from "./director.ts";
export { BPM, events, GRID } from "./model.ts";
export type { AudioEvent, Telemetry } from "./model.ts";
export type { EnvironmentAnchor } from "./director.ts";
