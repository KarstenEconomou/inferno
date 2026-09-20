import type { TrackDefinition } from "../definition";
import { burnline } from "./burnline";
import { vertigoWorks } from "./vertigo-works";

/** Every authored course, in the order the circuit list shows them. The key
 * is the circuit id in `src/circuits.ts`, so the identity and the geometry of
 * a circuit stay one thing. */
export const courses: Record<string, TrackDefinition> = {
  vertigo: vertigoWorks,
  burnline,
};
export const DEFAULT_COURSE = "vertigo";
