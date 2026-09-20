/** Public surface of the driving simulation. It is independent of the DOM,
 * the renderer and the interface, and advances at a fixed step. */
export { STEP, Vehicle, type Input } from "./vehicle";
export { HANDLING, propulsionAcceleration, type DriftPhase } from "./handling";
export {
  interpolatePose,
  parseRecord,
  Race,
  type Pose,
  type RecordRun,
} from "./race";
export { DrivingFeedback } from "./feedback";
