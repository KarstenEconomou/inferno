/** Arcade handling constants, in metres, seconds and radians.
 *
 * Every tire force removes energy from the movement and from the yaw. Only
 * the engine, the boost and gravity add energy. Bump TRACK_VERSION after a
 * handling change, because saved ghosts are no longer comparable. */
export const HANDLING = {
  gravity: 30,
  downforce: 0.025,
  contactReferenceLoad: 30,
  railFriction: 0.12,
  invertedCrashRecoveryTime: 0.35,
  // Air behaviour and landing behaviour.
  airReleaseDrag: 0.18,
  airDamping: 0.12,
  airCountersteer: 12,
  landingAlignment: Math.cos(Math.PI / 3),
  landingSpinLimit: 2.5,
  landingUnevenLoss: 0.45,
  landingSpinLoss: 0.1,
  landingGripRecoveryTime: 0.35,
  landingImpactScale: 24,
  roofRetention: 0.55,
  roofRestitution: 0.18,
  roofMinBounce: 0.8,
  impactSpinRetention: 0.65,
  impactMaxSpin: 5,
  loadGripCap: 1.5,
  lateralLoadResponse: 12,
  chassisHalfWidth: 1.29,
  wheelFront: 1.3,
  wheelRear: 1.35,
  wheelHalfWidth: 1.065,
  clearance: 0.65,
  suspensionTravel: 0.45,
  suspensionRest: 0.12,
  yawInertia: 2.8,
  steeringResponse: 12,
  steeringReturnResponse: 20,
  steeringAngle: 0.17,
  steeringSpeedScale: 30,
  driftStartSpeed: 53,
  driftFadeSpeed: 12,
  driftReadiness: 0.84,
  driftLateralLoad: 14,
  driftPreparationTime: 0.3,
  driftPreparationSteering: 0.2,
  driftEntryTime: 0.25,
  gripRecoveryTime: 0.35,
  countersteerRecoveryTime: 0.2,
  frontGrip: 42,
  rearGrip: 46,
  slidingFrontGrip: 8,
  slidingRearGrip: 4.2,
  lateralAcceleration: 85,
  slidingFrontAcceleration: 45,
  slidingRearAcceleration: 40,
  // Fraction of tire-work loss dissipated in a controlled slide. The rest of
  // the tire impulse bends momentum rather than scrubbing off forward speed.
  slidingScrubFraction: 0.15,
  yawDamping: 0.7,
  slidingYawDamping: 1,
  groundedRotationResponse: 24,
  acceleration: 18,
  braking: 58,
  reverseAcceleration: 18,
  maxSpeed: 85,
  reverseSpeed: 10,
  boostSpeed: 94,
  boostAcceleration: 80,
  boostDuration: 0.9,
  rollingDrag: 2,
  aeroDrag: 0.0015,
  excessiveSlip: (35 * Math.PI) / 180,
  rotationDamping: 5,
  excessiveScrub: 14,
} as const;
export type DriftPhase = "grip" | "drift" | "recovery" | "airborne";

/** Engine thrust decreases as the speed increases. Thrust and air drag are
 * equal at the nominal top speed on level ground. No limit clamps the
 * momentum, so a boost or a descent can take the car above that speed. */
export function propulsionAcceleration(speed: number, boosted = false) {
  const top = boosted ? HANDLING.boostSpeed : HANDLING.maxSpeed;
  const launch = boosted ? HANDLING.boostAcceleration : HANDLING.acceleration;
  const terminalDrag = HANDLING.rollingDrag + HANDLING.aeroDrag * top * top;
  return Math.max(
    0,
    launch - (launch - terminalDrag) * (Math.max(0, speed) / top) ** 2,
  );
}
