import { cameraSettings, type CameraSettings } from "../render/camera";
import { parseRecord, type RecordRun } from "../sim";
import { track, TRACK_VERSION } from "../track";
import {
  defaultHUD,
  defaultPad,
  defaults,
  GHOST_OPACITY,
  HUD_SAFE_ZONE,
  HUD_SCALE,
  migrateBindings,
  validHistory,
  type Bindings,
  type HistoryEntry,
  type HUDPrefs,
  type PadBindings,
} from "../ui";

/** Records and preferences stay in this browser. Each course keeps its own
 * records, and a different track version gets a different key again, because
 * older ghosts are no longer comparable. */
const bestKey = () => `inferno-best:${track.id}:${TRACK_VERSION}`;
const LEGACY_BEST_KEY = "inferno-best";
const historyKey = () => `inferno-history:${TRACK_VERSION}`;
const PREFERENCES_KEY = "inferno-settings";

/** Once-per-course guidance already shown. It names the course it belongs
 * to, because a lesson learned on one circuit is not learned on another. */
export type CourseGuide = {
  version: string;
  intro: boolean;
  lessons: string[];
};
export type Preferences = {
  bindings: Bindings;
  padBindings: PadBindings;
  hud: HUDPrefs;
  camera: CameraSettings;
  ghost: boolean;
  ghostOpacity: number;
  familiar: number;
  guide: CourseGuide;
  muted: boolean;
  /** Null keeps the value that the sound director starts with. */
  volume: number | null;
  audioMix: unknown;
};
export type LoadedSession = {
  preferences: Preferences;
  best: RecordRun | null;
  history: HistoryEntry[];
  /** True if local storage refused a read. The run then stays in memory. */
  unavailable: boolean;
};

const clamp = (value: number, limit: { min: number; max: number }) =>
  Math.max(limit.min, Math.min(limit.max, value));

function defaultPreferences(): Preferences {
  return {
    bindings: { ...defaults },
    padBindings: { ...defaultPad },
    hud: { ...defaultHUD },
    camera: cameraSettings(null),
    ghost: true,
    ghostOpacity: 0.65,
    familiar: 0,
    guide: { version: track.id, intro: false, lessons: [] },
    muted: false,
    volume: null,
    audioMix: null,
  };
}

function readPreferenceObject(): Record<string, unknown> {
  const raw = localStorage.getItem(PREFERENCES_KEY);
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed;
  } catch {
    /* Malformed preferences fall back to the defaults; storage still works. */
  }
  return {};
}

function applyGuide(into: Preferences, saved: unknown) {
  const guide = saved as
    { version?: string; intro?: boolean; lessons?: unknown[] } | undefined;
  if (guide?.version !== track.id) return;
  into.guide.version = track.id;
  into.guide.intro = guide.intro === true;
  for (const lesson of Array.isArray(guide.lessons) ? guide.lessons : [])
    if (typeof lesson === "string") into.guide.lessons.push(lesson);
}

function applyHUDPrefs(into: HUDPrefs, saved: unknown) {
  if (!saved || typeof saved !== "object") return;
  const v = saved as Record<string, unknown>;
  for (const k of [
    "timer",
    "delta",
    "splits",
    "checkpoint",
    "speed",
    "ghost",
  ] as const)
    if (typeof v[k] === "boolean") into[k] = v[k];
  if (typeof v.scale === "number" && Number.isFinite(v.scale))
    into.scale = clamp(v.scale, HUD_SCALE);
  if (typeof v.safe === "number" && Number.isFinite(v.safe))
    into.safe = clamp(v.safe, HUD_SAFE_ZONE);
}

/** Records for the course that is selected now. A circuit change reads them
 * again, because a best lap and its ghost belong to one course. */
export function loadRecords(): {
  best: RecordRun | null;
  history: HistoryEntry[];
} {
  try {
    return {
      best: parseRecord(
        localStorage.getItem(bestKey()) ??
          (track.id.startsWith("vertigo")
            ? localStorage.getItem(LEGACY_BEST_KEY)
            : null),
        TRACK_VERSION,
      ),
      history: validHistory(
        JSON.parse(localStorage.getItem(historyKey()) || "[]"),
        track.checkpoints.length + 1,
      ),
    };
  } catch {
    return { best: null, history: [] };
  }
}

/** Read the saved session. Every step keeps whatever it could resolve, so a
 * storage fault part of the way through still gives usable preferences. */
export function loadSession(): LoadedSession {
  const session: LoadedSession = {
    preferences: defaultPreferences(),
    best: null,
    history: [],
    unavailable: false,
  };
  const prefs = session.preferences;
  try {
    Object.assign(session, loadRecords());
    const saved = readPreferenceObject();
    applyGuide(prefs, saved.courseGuide);
    prefs.ghost = saved.ghost !== false;
    prefs.padBindings = migrateBindings(defaultPad, saved.padBindings);
    prefs.camera = cameraSettings(saved.camera);
    applyHUDPrefs(prefs.hud, saved.ui);
    prefs.bindings = migrateBindings(defaults, saved.bindings);
    if (
      typeof saved.ghostOpacity === "number" &&
      Number.isFinite(saved.ghostOpacity)
    )
      prefs.ghostOpacity = clamp(saved.ghostOpacity, GHOST_OPACITY);
    prefs.familiar = typeof saved.familiar === "number" ? saved.familiar : 0;

    prefs.muted = saved.muted === true;
    if (Number.isFinite(saved.volume))
      prefs.volume = Math.max(0, Math.min(1, saved.volume as number));
    if (saved.audioMix) prefs.audioMix = saved.audioMix;
  } catch {
    session.unavailable = true;
  }
  return session;
}

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

/** Each writer reports success. A refused write leaves the session in memory
 * and the interface says that records are not saved. */
export const savePreferences = (
  prefs: Preferences,
  guideVersion: string,
): boolean =>
  write(
    PREFERENCES_KEY,
    JSON.stringify({
      ghost: prefs.ghost,
      ui: prefs.hud,
      bindings: prefs.bindings,
      padBindings: prefs.padBindings,
      camera: prefs.camera,
      ghostOpacity: prefs.ghostOpacity,
      familiar: prefs.familiar,
      courseGuide: {
        version: guideVersion,
        intro: prefs.guide.intro,
        lessons: prefs.guide.lessons,
      },
      muted: prefs.muted,
      volume: prefs.volume,
      audioMix: prefs.audioMix,
    }),
  );

export const saveBest = (best: RecordRun): boolean =>
  write(bestKey(), JSON.stringify(best));

export const saveHistory = (history: HistoryEntry[]): boolean =>
  write(historyKey(), JSON.stringify(history));
