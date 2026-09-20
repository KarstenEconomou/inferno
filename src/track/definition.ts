/** The authoring schema for a course. A definition holds only data: the
 * compiler in compile.ts turns it into geometry.
 */
/** Coordinates are metres, Y is up. Markers use normalized arc length, not
 * control-point indices. A closed course must not repeat its first node. */
export interface JumpSettings {
  rampLength: number;
  rampHeight: number;
  extraWidth: number;
  widthBlend: number;
}
/** One station of the painted lane, as lap fraction, lateral offset from the
 * centre of the corridor, and half of the paved width. All in metres. */
export interface LaneMark {
  at: number;
  offset: number;
  halfWidth: number;
}
/** A paved lane inside a wider corridor.
 *
 * Some courses are not a road with edges but a graded corridor with a road
 * painted through it. The paint carries full grip; the terrain beside it
 * carries the car with less cornering grip and more drag. Both are the same
 * deterministic surface, so a line across the terrain is a racing line and
 * not an escape from the course.
 */
export interface LaneSettings {
  marks: LaneMark[];
  /** Cornering grip off the paint, as a fraction of the paved value. */
  grip: number;
  /** Rolling deceleration added off the paint, in metres per second squared. */
  drag: number;
  /** Width of the grip transition across the edge of the paint, in metres. */
  blend: number;
}
export interface TrackDefinition {
  id: string;
  name: string;
  nodes: [number, number, number][];
  width: number;
  tension?: number;
  curveType?: "catmullrom" | "centripetal" | "smooth";
  resolution?: number;
  /** Which world is built around the road. Defaults to the works. */
  scenery?: "works" | "desert";
  startPlatform?: { halfLength: number; blendLength: number };
  lane?: LaneSettings;
  jump?: JumpSettings;
  jumpProfiles?: Partial<JumpSettings>[];
  widthZones?: { start: number; end: number; width: number; blend: number }[];
  features?: {
    kind:
      | "wallride"
      | "loop"
      | "helix"
      | "inverted"
      | "hairpin"
      | "sweeper"
      | "jump"
      | "terrain-cut";
    start: number;
    end: number;
  }[];
  sectors?: { name: string; description: string }[];
  lessons?: {
    id: string;
    start: number;
    end: number;
    title: string;
    detail: string;
  }[];
  crossings?: [number, number];
  banking?: { max: number; strength: number };
  /** Absolute roll relative to the transported road frame; radians may exceed π. */
  frameAnchors?: { t: number; up: [number, number, number] }[];
  bankZones?: { start: number; end: number; angle: number; blend: number }[];
  rolls?: { start: number; end: number; turns: number }[];
  checkpoints: number[];
  boosts: number[];
  gaps: [number, number][];
  landmarks?: {
    kind: "rib-vault" | "pipe-bridge" | "cantilever";
    start: number;
    count: number;
    spacing: number;
  }[];
  gallery?: { start: number; count: number; spacing: number };
}
