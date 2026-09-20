import { Vector3 } from "three";
import type { JumpSettings, TrackDefinition } from "./definition";

/** Jump shape used where a gap has no profile of its own. */
const DEFAULT_JUMP: JumpSettings = {
  rampLength: 32,
  rampHeight: 4,
  extraWidth: 10,
  widthBlend: 90,
};
/** Curvature-to-roll response used where a course states no banking. */
const DEFAULT_BANKING = { max: 0.5, strength: 1.8 };

/** Check a course definition and resolve its optional settings. An invalid
 * definition throws here, at compile time, and never reaches the game.
 */
export function validateTrack(track: TrackDefinition) {
  const jump = track.jump ?? DEFAULT_JUMP;
  const jumps = track.gaps.map((_, i) => ({
    ...jump,
    ...track.jumpProfiles?.[i],
  }));
  const banking = track.banking ?? DEFAULT_BANKING;
  if (
    track.nodes.length < 4 ||
    track.width <= 0 ||
    track.nodes.some((n) => n.some((v) => !Number.isFinite(v)))
  )
    throw new Error("Track requires four finite nodes and a positive width");
  if (
    track.resolution !== undefined &&
    (!Number.isInteger(track.resolution) || track.resolution < 64)
  )
    throw new Error("Track resolution must be an integer of at least 64");
  if (track.checkpoints.some((t, i) => i > 0 && t <= track.checkpoints[i - 1]))
    throw new Error("Checkpoints must be ordered around the lap");
  if (track.jumpProfiles && track.jumpProfiles.length !== track.gaps.length)
    throw new Error("Provide one jump profile per gap");
  if (track.sectors && track.sectors.length !== track.checkpoints.length + 1)
    throw new Error("Sectors include the final section to the finish");
  if (
    (track.startPlatform &&
      (!Number.isFinite(track.startPlatform.halfLength) ||
        !Number.isFinite(track.startPlatform.blendLength) ||
        track.startPlatform.halfLength < 0 ||
        track.startPlatform.blendLength <= 0)) ||
    [jump, ...jumps].some(
      (j) =>
        Object.values(j).some((v) => !Number.isFinite(v)) ||
        j.rampLength <= 0 ||
        j.widthBlend <= 0 ||
        j.rampHeight < 0 ||
        j.extraWidth < 0,
    ) ||
    track.widthZones?.some(
      (z) =>
        z.start < 0 ||
        z.end >= 1 ||
        z.start >= z.end ||
        z.width < track.width ||
        z.blend <= 0 ||
        Object.values(z).some((v) => !Number.isFinite(v)),
    ) ||
    banking.max < 0 ||
    !Number.isFinite(banking.max)
  )
    throw new Error("Invalid jump or banking settings");
  const markers = [
    ...track.checkpoints,
    ...track.boosts,
    ...track.gaps.flat(),
    ...(track.landmarks ?? []).map((s) => s.start),
  ];
  if (
    markers.some((t) => !Number.isFinite(t) || t < 0 || t >= 1) ||
    track.gaps.some(([a, b]) => a >= b)
  )
    throw new Error(
      "Track markers must be in [0, 1); gap start must precede end",
    );
  for (const zone of [
    ...(track.bankZones ?? []),
    ...(track.rolls ?? []),
    ...(track.features ?? []),
  ]) {
    if (
      !Number.isFinite(zone.start) ||
      !Number.isFinite(zone.end) ||
      zone.start < 0 ||
      zone.end > 1 ||
      zone.end <= zone.start
    )
      throw new Error(
        "Orientation zones must be finite ordered intervals within the lap",
      );
  }
  if (
    track.bankZones?.some(
      (z) =>
        !Number.isFinite(z.angle) || !Number.isFinite(z.blend) || z.blend < 0,
    ) ||
    track.rolls?.some((z) => !Number.isFinite(z.turns))
  )
    throw new Error("Invalid road roll settings");
  if (track.lane) {
    const { marks, grip, drag, blend } = track.lane;
    if (
      marks.length < 4 ||
      ![grip, drag, blend].every(Number.isFinite) ||
      grip <= 0 ||
      grip > 1 ||
      drag < 0 ||
      blend <= 0 ||
      marks.some(
        (m, i) =>
          ![m.at, m.offset, m.halfWidth].every(Number.isFinite) ||
          m.at < 0 ||
          m.at >= 1 ||
          m.halfWidth <= 0 ||
          (i > 0 && m.at <= marks[i - 1].at),
      )
    )
      throw new Error(
        "A painted lane needs four ordered marks, a positive width and a grip fraction",
      );
  }
  if (
    track.frameAnchors &&
    (track.frameAnchors[0]?.t !== 0 ||
      track.frameAnchors.at(-1)?.t !== 1 ||
      track.frameAnchors.some(
        (a, i) =>
          !Number.isFinite(a.t) ||
          a.t < 0 ||
          a.t > 1 ||
          (i > 0 && a.t <= track.frameAnchors![i - 1].t) ||
          a.up.some((v) => !Number.isFinite(v)) ||
          new Vector3(...a.up).lengthSq() < 1e-8,
      ))
  )
    throw new Error(
      "Frame anchors must have finite directions, run from 0 to 1, and be ordered",
    );
  return { jump, jumps, banking };
}
