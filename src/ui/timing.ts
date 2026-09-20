/** Lap-time arithmetic and the validation of saved timing history. */

/** Format seconds as MM:SS.mmm. */
export const format = (t: number) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${(t % 60).toFixed(3).padStart(6, "0")}`;

/** Format a time difference with an explicit sign. */
export const delta = (t: number) =>
  `${t < 0 ? "−" : "+"}${Math.abs(t).toFixed(3)}`;

/** Format a time difference and say which side of the reference it is on. */
export const pace = (t: number) =>
  `${delta(t)} ${Math.abs(t) < 0.005 ? "LEVEL" : t < 0 ? "AHEAD" : "BEHIND"}`;

/** Convert cumulative split times into per-sector durations. The final sector
 * runs from the last split to the finish, so the lap time closes the list. */
export const sectors = (splits: number[], time: number) =>
  [...splits, time].map((t, i) => t - (i ? splits[i - 1] : 0));

export type HistoryEntry = { date: string; time: number; sectors: number[] };

/** Keep only well-formed history rows for the current sector count. Saved data
 * can come from an older version or from a different browser profile. */
export function validHistory(value: unknown, count: number): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (v): v is HistoryEntry =>
        !!v &&
        typeof v.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(v.date) &&
        Number.isFinite(v.time) &&
        v.time > 0 &&
        Array.isArray(v.sectors) &&
        v.sectors.length === count &&
        v.sectors.every(
          (s: unknown) => typeof s === "number" && Number.isFinite(s) && s > 0,
        ),
    )
    .slice(-50);
}

/** Project a position onto the recorded trajectory inside one checkpoint
 * interval and give the time at that point. Distant lines and respawn cuts
 * give null, because they have no comparable pace. */
export function comparisonTime(
  poses: { t: number; p: number[]; cut?: boolean }[],
  position: number[],
  from: number,
  to: number,
): number | null {
  let distance = Infinity,
    time: number | null = null;
  for (let i = 1; i < poses.length; i++) {
    const a = poses[i - 1],
      b = poses[i];
    if (b.cut || b.t < from || a.t > to) continue;
    const d = b.p.map((v, j) => v - a.p[j]);
    const length = d.reduce((s, v) => s + v * v, 0);
    if (length < 0.0001) continue;
    const alpha = Math.max(
      0,
      Math.min(
        1,
        d.reduce((s, v, j) => s + v * (position[j] - a.p[j]), 0) / length,
      ),
    );
    const squared = d.reduce(
      (s, v, j) => s + (position[j] - a.p[j] - v * alpha) ** 2,
      0,
    );
    if (squared < distance) {
      distance = squared;
      time = a.t + (b.t - a.t) * alpha;
    }
  }
  return distance < 35 * 35 ? time : null;
}
