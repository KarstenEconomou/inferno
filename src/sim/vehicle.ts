import { Matrix4, Quaternion, Vector3 } from "three";
import { BOOST_PAD_BOUNDS } from "../track/markers";
import {
  frame,
  inGap,
  lane,
  length,
  nearest,
  onCourseChange,
  track,
  roadWidth,
  surface,
  surfaceDrag,
  surfaceGrip,
  type RoadContact,
} from "../track";
import {
  probeWheels,
  sweepDeck,
  sweepWheels,
  wheelOffsets,
  type WheelSupport,
} from "./contact";
import {
  HANDLING as H,
  propulsionAcceleration,
  type DriftPhase,
} from "./handling";
export const STEP = 1 / 120;
/** Boost pads sit on the painted lane, so a course that paints its road
 * off the centre of a wide corridor keeps its pads on the paint. */
const buildBoostPads = () =>
  track.boosts.map((t) => {
    const f = frame(t);
    return { ...f, p: f.p.clone().addScaledVector(f.right, lane(t).offset) };
  });
let boostPads = buildBoostPads();
onCourseChange(() => {
  boostPads = buildBoostPads();
});
export interface Input {
  throttle: number;
  steer: number;
  brake: boolean;
}
/** The car. It holds the full physical state and advances that state by one
 * fixed step. It knows the road and the handling constants, and nothing about
 * the renderer, the interface or the race rules. */
export class Vehicle {
  position = new Vector3();
  velocity = new Vector3();
  heading = new Vector3();
  up = new Vector3(0, 1, 0);
  get speed() {
    return (
      this.velocity.length() *
      (this.velocity.dot(this.heading) < -0.01 ? -1 : 1)
    );
  }
  driftPhase: DriftPhase = "grip";
  driftBlend = 0;
  yawRate = 0;
  slipAngle = 0;
  slipIntensity = 0;
  contactGrip = 1;
  normalLoad: number = H.gravity;
  private contactNormal = new Vector3(0, 1, 0);
  resetSerial = 0;
  grounded = true;
  progress = 0;
  boost = 0;
  activePad = -1;
  travel = 0;
  angularVelocity = new Vector3();
  steering = 0;
  get steeringAngle() {
    return (
      (-this.steering * H.steeringAngle) /
      (1 + this.velocity.length() / H.steeringSpeedScale)
    );
  }
  lateralLoad = 0;
  driftReadiness = 0;
  private driftPreparation = 0;
  private driftDirection = 0;
  private driftTransition = 0;
  private driftRequested = false;
  /** Includes the accepted setup and recovery, while propulsion still carries
   * the slide. Feedback must not treat the brake key as straight-line braking. */
  get driftEngaged() {
    return (
      this.driftRequested || this.driftPhase === "drift" || this.driftBlend > 0
    );
  }
  contactMask = 15;
  frontLoad = H.gravity / 2;
  rearLoad = H.gravity / 2;
  suspensionCompression = [0, 0, 0, 0];
  private groundRotation = new Vector3();
  private railAge = Infinity;
  private crashFlightAge: number | null = null;
  get needsRespawn() {
    return (
      this.crashFlightAge !== null &&
      this.crashFlightAge >= H.invertedCrashRecoveryTime
    );
  }
  railContact = false;
  railImpact = 0;
  landingImpact = 0;
  landingAge = 1;
  get suspension() {
    return (
      this.landingImpact *
      Math.exp(-this.landingAge * 14) *
      Math.sin(this.landingAge * 24)
    );
  }
  constructor() {
    this.reset(0);
  }
  reset(t: number) {
    const f = frame(t);
    this.position.copy(f.p).addScaledVector(f.up, H.clearance);
    this.velocity.set(0, 0, 0);
    this.heading.copy(f.forward);
    this.up.copy(surface(t).normal);
    this.contactNormal.copy(this.up);
    this.normalLoad = H.gravity;
    this.driftPhase = "grip";
    this.driftBlend = this.yawRate = this.slipAngle = this.slipIntensity = 0;
    this.contactGrip = 1;
    this.resetSerial++;
    this.travel = 0;
    this.grounded = true;
    this.progress = t;
    this.boost = 0;
    this.activePad = -1;
    this.angularVelocity.set(0, 0, 0);
    this.steering = this.lateralLoad = this.driftReadiness = 0;
    this.driftPreparation = this.driftDirection = this.driftTransition = 0;
    this.driftRequested = false;
    this.contactMask = 15;
    this.frontLoad = this.rearLoad = H.gravity / 2;
    this.suspensionCompression.fill(0);
    this.groundRotation.set(0, 0, 0);
    this.railAge = Infinity;
    this.crashFlightAge = null;
    this.railContact = false;
    this.railImpact = 0;
    this.landingImpact = 0;
    this.landingAge = 1;
  }
  /** Advance the car by one fixed step. The order is deliberate: read the
   * road, settle the contact, run either the grounded or the airborne
   * dynamics, then record the slip and rotation that the rest of the game
   * reads. */
  step(input: Input, dt = STEP) {
    const previousOrientation = this.orientation();
    let advancedOnGround = false;
    this.landingAge += dt;
    this.railAge += dt;
    if (!this.grounded && this.crashFlightAge !== null)
      this.crashFlightAge += dt;
    this.railContact = false;
    this.railImpact = 0;
    const old = this.position.clone();
    const road = nearest(this.position, this.progress);
    this.progress = road.t;
    this.boost = Math.max(0, this.boost - dt);
    const wheels = probeWheels(this.position, this.heading, this.up, road.t);
    this.contactMask = this.grounded ? wheels.mask : 0;
    this.suspensionCompression = wheels.compression;
    const normal =
      this.grounded && wheels.mask
        ? wheels.normal
        : surface(road.t, road.lateral).normal;
    if (this.grounded) this.settleContact(road, wheels, normal, dt);
    this.enterBoostPads();
    if (this.grounded) {
      advancedOnGround = true;
      this.driveOnGround(input, old, road, normal, dt);
    } else if (this.flyThroughAir(input, old, dt)) return;
    this.recordMotion(previousOrientation, old, advancedOnGround, dt);
  }

  /** A pad starts a bounded acceleration interval, never a speed assignment.
   * Re-entering refreshes its duration rather than stacking extra impulses. */
  private enterBoostPads() {
    const pad = this.grounded
      ? boostPads.findIndex((f) => {
          const offset = this.position.clone().sub(f.p);
          return (
            Math.abs(offset.dot(f.right)) <= BOOST_PAD_BOUNDS.halfWidth &&
            Math.abs(offset.dot(f.forward)) <= BOOST_PAD_BOUNDS.halfLength &&
            Math.abs(offset.dot(f.up) - H.clearance) <= H.suspensionTravel
          );
        })
      : -1;
    if (
      pad >= 0 &&
      pad !== this.activePad &&
      this.velocity.dot(boostPads[pad].forward) >= -0.5 &&
      this.heading.dot(boostPads[pad].forward) > 0.25
    )
      this.boost = H.boostDuration;
    this.activePad = pad;
  }

  /** Align momentum with the contact plane and measure the tire load. The
   * car leaves the ground when that load cannot hold it down. */
  private settleContact(
    road: RoadContact,
    wheels: WheelSupport,
    normal: Vector3,
    dt: number,
  ) {
    // Rotate the tangent momentum with the contact plane and keep its length.
    // A projection instead of a rotation removes speed on loops and on steep
    // changes of bank.
    this.transportContact(normal);
    const along = this.velocity.dot(road.forward);
    const across = this.velocity.dot(road.right);
    let nextContact = road.t + (along * dt) / length;
    for (const [lip] of track.gaps)
      if (road.t <= lip && nextContact > lip) nextContact = lip;
    // The curvature load ends at the launch edge. Beyond that edge there is
    // no deck, and a sample there would release the tires and then catch the
    // car again on the lip.
    const upcoming = surface(nextContact, road.lateral + across * dt).normal;
    const curvatureLoad =
      -this.velocity.dot(upcoming.sub(surface(road.t, road.lateral).normal)) /
      dt;
    this.normalLoad =
      curvatureLoad +
      H.gravity * normal.y +
      H.downforce * this.velocity.lengthSq();
    this.frontLoad = Math.max(0, this.normalLoad) * wheels.front;
    this.rearLoad = Math.max(0, this.normalLoad) * wheels.rear;
    if (this.normalLoad < -0.01 || !wheels.mask) this.leaveGround(false);
  }

  /** Grounded dynamics: steering, tire forces, drive, drag and rails. */
  private driveOnGround(
    input: Input,
    old: Vector3,
    road: RoadContact,
    normal: Vector3,
    dt: number,
  ) {
    const forward = this.velocity.dot(this.heading);
    // Cornering grip is a property of the surface under the tires. On a
    // course with a painted lane the graded terrain beside it holds the car
    // but turns it less willingly, so a line across it has to be committed
    // to and driven straight.
    const terrain = surfaceGrip(road.t, road.lateral);
    const steering = Math.max(-1, Math.min(1, input.steer));
    const returning =
      steering * this.steering < 0 ||
      Math.abs(steering) < Math.abs(this.steering);
    this.steering +=
      (steering - this.steering) *
      (1 -
        Math.exp(
          -(returning ? H.steeringReturnResponse : H.steeringResponse) * dt,
        ));
    const right = this.heading.clone().cross(normal).normalize();
    const slip = Math.atan2(
      this.velocity.dot(right),
      Math.max(0.1, Math.abs(forward)),
    );
    const braking = input.brake || input.throttle < 0;
    const throttle = Math.max(0, Math.min(1, input.throttle));
    const countersteering = steering * slip > 0.02;
    const direction = Math.sign(steering);
    const directionChanged = direction !== this.driftDirection;
    // Accept the combined controls while the tires build lateral load. Early
    // brake input must not freeze preparation and brake away the entry speed.
    // Latch a valid request through small speed changes on an uphill entry.
    this.driftRequested =
      braking &&
      throttle > 0 &&
      !countersteering &&
      Math.abs(steering) >= H.driftPreparationSteering &&
      forward > H.driftFadeSpeed &&
      (forward >= H.driftStartSpeed ||
        (this.driftRequested && !directionChanged) ||
        this.driftPhase === "drift");
    if (
      directionChanged ||
      Math.abs(steering) < H.driftPreparationSteering ||
      this.contactGrip < 1 ||
      ((!braking || this.driftRequested) &&
        this.lateralLoad < H.driftLateralLoad * H.driftReadiness)
    )
      this.driftPreparation = 0;
    this.driftDirection = direction;
    if (
      (!braking || this.driftRequested) &&
      Math.abs(steering) >= H.driftPreparationSteering &&
      this.lateralLoad >= H.driftLateralLoad * H.driftReadiness
    )
      this.driftPreparation = Math.min(
        H.driftPreparationTime,
        this.driftPreparation + dt,
      );
    this.driftReadiness = Math.min(
      // Readiness measures response to the requested steering, so a loaded
      // half-stick corner can prepare just as a keyboard full-lock corner can.
      Math.abs(this.steering) /
        Math.max(H.driftPreparationSteering, Math.abs(steering)),
      1,
      this.lateralLoad / H.driftLateralLoad,
      this.driftPreparation / H.driftPreparationTime,
    );
    // Entry speed gates initiation only. A valid entry remains engaged while
    // its forces ramp in; brake reapplication can also catch a sliding rear.
    const drifting =
      braking &&
      !countersteering &&
      !directionChanged &&
      Math.abs(steering) >= H.driftPreparationSteering &&
      forward > H.driftFadeSpeed &&
      (this.driftPhase === "drift" ||
        (this.driftBlend > 0.2 && Math.abs(slip) > 0.04) ||
        ((forward >= H.driftStartSpeed || this.driftRequested) &&
          this.driftReadiness >= H.driftReadiness));
    const targetBlend = drifting ? 1 : 0;
    const transition =
      dt /
      (drifting
        ? H.driftEntryTime
        : countersteering
          ? H.countersteerRecoveryTime
          : H.gripRecoveryTime);
    this.driftTransition += Math.max(
      -transition,
      Math.min(transition, targetBlend - this.driftTransition),
    );
    // Smoothstep gives both ends of entry/recovery a gentle force ramp.
    this.driftBlend =
      this.driftTransition ** 2 * (3 - 2 * this.driftTransition);
    this.contactGrip = Math.min(
      1,
      this.contactGrip + dt / H.landingGripRecoveryTime,
    );
    this.driftPhase = drifting
      ? "drift"
      : this.driftBlend > 0 || this.contactGrip < 1 || Math.abs(slip) > 0.12
        ? "recovery"
        : "grip";
    const steerAngle = this.steeringAngle;
    // Each axle absorbs the slip at its contact point, and its lever arm
    // makes the yaw. There is no target yaw rate and no forced alignment.
    let lateralImpulse = 0;
    for (const front of [true, false]) {
      const lever = this.heading
        .clone()
        .multiplyScalar(front ? H.wheelFront : -H.wheelRear);
      const tireRight = right
        .clone()
        .applyAxisAngle(normal, front ? steerAngle : 0);
      const moment = lever.clone().cross(tireRight).dot(normal);
      const contactSlip = this.velocity.dot(tireRight) + this.yawRate * moment;
      const grip =
        (front
          ? H.frontGrip + (H.slidingFrontGrip - H.frontGrip) * this.driftBlend
          : H.rearGrip + (H.slidingRearGrip - H.rearGrip) * this.driftBlend) *
        this.contactGrip *
        terrain;
      const load = front ? this.frontLoad : this.rearLoad;
      const cap =
        (front
          ? H.lateralAcceleration +
            (H.slidingFrontAcceleration - H.lateralAcceleration) *
              this.driftBlend
          : H.lateralAcceleration +
            (H.slidingRearAcceleration - H.lateralAcceleration) *
              this.driftBlend) *
        Math.min(
          H.loadGripCap,
          Math.max(0, load) / (H.contactReferenceLoad / 2),
        ) *
        this.contactGrip *
        terrain *
        dt;
      const impulse =
        -Math.sign(contactSlip) *
        Math.min(
          cap,
          (Math.abs(contactSlip) * (1 - Math.exp(-grip * dt))) /
            (1 + (moment * moment) / H.yawInertia),
        );
      const energy =
        this.velocity.lengthSq() + H.yawInertia * this.yawRate ** 2;
      this.velocity.addScaledVector(tireRight, impulse);
      this.yawRate += (moment * impulse) / H.yawInertia;
      // In a controlled slide, tire forces predominantly redirect momentum.
      // Integrate the new direction with a reduced scrub loss, budgeting yaw
      // energy as well so steering can never create mechanical energy.
      if (this.driftBlend > 0 && forward > H.driftFadeSpeed) {
        const yawEnergy = H.yawInertia * this.yawRate ** 2;
        const remaining = this.velocity.lengthSq() + yawEnergy;
        const scrubFraction =
          1 -
          (1 - H.slidingScrubFraction) *
            Math.max(
              0,
              1 -
                Math.max(0, Math.abs(slip) - H.excessiveSlip) / H.excessiveSlip,
            );
        const speedSquared = Math.max(
          0,
          energy - Math.max(0, energy - remaining) * scrubFraction - yawEnergy,
        );
        if (this.velocity.lengthSq() > 1e-8)
          this.velocity.multiplyScalar(
            Math.sqrt(speedSquared / this.velocity.lengthSq()),
          );
      }
      lateralImpulse += Math.abs(impulse);
    }
    this.lateralLoad +=
      (lateralImpulse / dt - this.lateralLoad) *
      (1 - Math.exp(-H.lateralLoadResponse * dt));
    const excessive = Math.max(0, Math.abs(slip) - H.excessiveSlip);
    this.yawRate *= Math.exp(
      -(
        H.yawDamping +
        this.driftBlend * H.slidingYawDamping * this.yawRate ** 2 +
        excessive * H.rotationDamping
      ) * dt,
    );
    this.heading.applyAxisAngle(normal, this.yawRate * dt).normalize();
    const gravity = new Vector3(0, -H.gravity, 0).projectOnPlane(normal);
    this.velocity.addScaledVector(gravity, dt);
    // Keep propulsion through setup and brief steering corrections as well as
    // the established slide. Lifting throttle always restores full braking.
    const poweredDrift = throttle > 0 && this.driftEngaged;
    if (braking && forward > 0.01 && !poweredDrift) {
      const speed = this.velocity.length();
      this.velocity.multiplyScalar(
        Math.max(0, speed - H.braking * dt) / (speed || 1),
      );
    } else if (braking && !poweredDrift) {
      const reverseRoom = Math.max(
        0,
        H.reverseSpeed + this.velocity.dot(this.heading),
      );
      this.velocity.addScaledVector(
        this.heading,
        -Math.min(H.reverseAcceleration * dt, reverseRoom),
      );
    } else {
      this.velocity.addScaledVector(
        this.heading,
        throttle *
          propulsionAcceleration(Math.max(0, forward), this.boost > 0) *
          dt,
      );
    }
    const speed = this.velocity.length();
    const scrub =
      Math.max(0, Math.abs(slip) - H.excessiveSlip) * H.excessiveScrub;
    const drag =
      (H.rollingDrag +
        surfaceDrag(road.t, road.lateral) +
        speed * speed * H.aeroDrag +
        scrub) *
      dt;
    this.velocity.multiplyScalar(Math.max(0, speed - drag) / (speed || 1));
    this.position.addScaledVector(this.velocity, dt);

    this.collideRails(old, dt);
    const next = nearest(this.position, road.t);
    const support = probeWheels(this.position, this.heading, this.up, next.t);
    this.contactMask = support.mask;
    this.suspensionCompression = support.compression;
    if (
      !this.grounded ||
      !support.mask ||
      Math.abs(next.lateral) > roadWidth(next.t) / 2 + 1
    ) {
      if (this.grounded) this.leaveGround(true);
    } else {
      this.position.addScaledVector(support.normal, support.correction);
      this.transportContact(support.normal);
    }
  }

  /** Airborne dynamics, then the first deck or rail contact along the path.
   * Returns true when a failed landing ends the step early. */
  private flyThroughAir(input: Input, old: Vector3, dt: number) {
    this.driftRequested = false;
    this.driftPhase = "airborne";
    this.driftBlend = this.yawRate = this.slipIntensity = 0;
    this.driftPreparation =
      this.driftDirection =
      this.driftTransition =
      this.driftReadiness =
        0;
    this.normalLoad = 0;
    this.velocity.y -= H.gravity * dt;
    this.position.addScaledVector(this.velocity, dt);
    this.contactMask = 0;
    this.frontLoad = this.rearLoad = 0;
    this.suspensionCompression.fill(0);
    const right = this.heading.clone().cross(this.up).normalize();
    if (input.throttle <= 0)
      this.velocity.multiplyScalar(Math.exp(-H.airReleaseDrag * dt));
    this.angularVelocity.multiplyScalar(Math.exp(-H.airDamping * dt));
    // The air brake stops the pitch in one step, at the current attitude.
    if (input.brake || input.throttle < 0)
      this.angularVelocity.addScaledVector(
        right,
        -this.angularVelocity.dot(right),
      );
    // Steering only opposes a yaw or a roll that already turns. It cannot
    // start a rotation in the air.
    const steering = Math.max(-1, Math.min(1, input.steer));
    for (const [axis, direction] of [
      [this.up, -steering],
      [this.heading, steering],
    ] as const) {
      const rate = this.angularVelocity.dot(axis);
      if (rate * direction < 0)
        this.angularVelocity.addScaledVector(
          axis,
          -rate * (1 - Math.exp(-H.airCountersteer * Math.abs(steering) * dt)),
        );
    }
    const spin = this.angularVelocity.length();
    if (spin > 0.00001) {
      const axis = this.angularVelocity.clone().divideScalar(spin);
      this.heading.applyAxisAngle(axis, spin * dt).normalize();
      this.up.applyAxisAngle(axis, spin * dt).normalize();
    }
    this.up
      .addScaledVector(this.heading, -this.up.dot(this.heading))
      .normalize();
    // Find the first deck contact along the flight. The path can start above
    // a gap, or end below the landing platform or just after it.
    const chassisHit = sweepDeck(old, this.position);
    const wheelHit = sweepWheels(old, this.position, this.heading, this.up);
    const deck =
      wheelHit && (!chassisHit || wheelHit.fraction < chassisHit.fraction)
        ? wheelHit
        : chassisHit;
    const flightEnd = this.position.clone();
    if (deck) this.position.copy(deck.position);
    const hitRail = this.collideRails(old, dt * (deck?.fraction ?? 1));
    const landing = hitRail ? sweepDeck(old, this.position) : deck;
    if (landing) return this.land(landing, wheelHit, old, dt);
    if (!hitRail) this.position.copy(flightEnd);
    return false;
  }

  /** Resolve one landing. Wheels-down contact restores grip; side or roof
   * contact dissipates the impact, bounces clear and ends the step. */
  private land(
    landing: NonNullable<ReturnType<typeof sweepDeck>>,
    wheelHit: ReturnType<typeof sweepWheels>,
    old: Vector3,
    dt: number,
  ) {
    const next = nearest(landing.position);
    this.landingImpact = Math.min(
      1,
      Math.max(0, -this.velocity.dot(landing.normal)) / H.landingImpactScale,
    );
    this.landingAge = 0;
    const alignment = this.up.dot(landing.normal);
    const spinPenalty = Math.min(
      1,
      this.angularVelocity.length() / H.landingSpinLimit,
    );
    const wheelsDown = alignment >= H.landingAlignment;
    if (!wheelsDown) {
      // Contact on a side or on the roof cannot engage the tires. Absorb the
      // impact and move clear of the deck, so the next contact can resolve.
      const normalSpeed = Math.max(0, -this.velocity.dot(landing.normal));
      this.position
        .copy(landing.position)
        .addScaledVector(landing.normal, 0.025);
      this.velocity
        .addScaledVector(landing.normal, normalSpeed)
        .multiplyScalar(H.roofRetention);
      this.velocity.addScaledVector(
        landing.normal,
        Math.max(H.roofMinBounce, normalSpeed * H.roofRestitution),
      );
      this.angularVelocity.multiplyScalar(H.impactSpinRetention);
      this.landingImpact = Math.max(this.landingImpact, 0.65);
      this.contactGrip = 0;
      this.progress = next.t;
      this.travel += old.distanceTo(this.position);
      return true;
    }
    this.grounded = true;
    this.crashFlightAge = null;
    this.contactNormal.copy(landing.normal);
    this.up.copy(landing.normal);
    this.position.copy(landing.position);
    this.velocity.addScaledVector(
      landing.normal,
      -this.velocity.dot(landing.normal),
    );
    this.velocity.multiplyScalar(
      1 -
        (1 - alignment) * H.landingUnevenLoss -
        spinPenalty * H.landingSpinLoss,
    );
    if (this.velocity.length() < 0.1) this.velocity.set(0, 0, 0);
    this.heading.addScaledVector(
      landing.normal,
      -this.heading.dot(landing.normal),
    );
    if (this.heading.lengthSq() < 1e-8) this.heading.copy(next.forward);
    this.heading.normalize();
    // Settle around the wheel that touched first. Rotation around the centre
    // lifts all four wheels off the deck again.
    if (landing === wheelHit && wheelHit)
      this.position
        .copy(wheelHit.anchor)
        .sub(wheelOffsets(this.heading, this.up)[wheelHit.wheel]);
    this.yawRate =
      this.angularVelocity.dot(landing.normal) * (1 - spinPenalty * 0.5);
    this.angularVelocity.set(0, 0, 0);
    this.groundRotation.set(0, 0, 0);
    this.contactGrip = 0;
    const support = probeWheels(this.position, this.heading, this.up, next.t);
    this.contactMask = support.mask;
    this.suspensionCompression = support.compression;
    this.driftPhase = "recovery";
    const contact = this.position.clone();
    this.position.addScaledVector(this.velocity, dt * (1 - landing.fraction));
    this.collideRails(contact, dt * (1 - landing.fraction));
    // The suspension movement is visual only. It does not change contact.
    return false;
  }

  /** Slip, distance and the rotation that a takeoff carries into the air. */
  private recordMotion(
    previousOrientation: Quaternion,
    old: Vector3,
    advancedOnGround: boolean,
    dt: number,
  ) {
    const contact = nearest(this.position, this.progress);
    const lateral = this.velocity.dot(
      this.heading.clone().cross(contact.up).normalize(),
    );
    this.slipAngle = Math.atan2(
      lateral,
      Math.max(0.1, Math.abs(this.velocity.dot(this.heading))),
    );
    this.slipIntensity = this.grounded
      ? Math.min(1, Math.max(0, Math.abs(this.slipAngle) - 0.07) / 0.45) *
        Math.min(1, this.velocity.length() / 25)
      : 0;
    if (!this.grounded) this.driftPhase = "airborne";
    this.travel += old.distanceTo(this.position);
    this.progress = contact.t;
    if (advancedOnGround) {
      const delta = this.orientation()
        .multiply(previousOrientation.invert())
        .normalize();
      if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
      const sin = Math.hypot(delta.x, delta.y, delta.z);
      const rotation = new Vector3(delta.x, delta.y, delta.z).multiplyScalar(
        sin > 1e-9 ? (2 * Math.atan2(sin, delta.w)) / (sin * dt) : 0,
      );
      this.groundRotation.lerp(
        rotation,
        1 - Math.exp(-H.groundedRotationResponse * dt),
      );
      if (!this.grounded) this.angularVelocity.copy(this.groundRotation);
    }
  }
  private orientation() {
    const right = this.heading.clone().cross(this.up).normalize();
    return new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(
        right,
        right.clone().cross(this.heading).normalize(),
        this.heading.clone().negate(),
      ),
    );
  }
  private transportContact(normal: Vector3) {
    const rotation = new Quaternion().setFromUnitVectors(
      this.contactNormal,
      normal,
    );
    this.velocity.applyQuaternion(rotation);
    // Remove only the residual speed along the normal. Keep curvature speed.
    this.velocity.addScaledVector(normal, -this.velocity.dot(normal));
    this.heading.applyQuaternion(rotation).projectOnPlane(normal).normalize();
    this.up.copy(normal);
    this.contactNormal.copy(normal);
  }
  private leaveGround(lip: boolean) {
    this.driftRequested = false;
    this.driftPreparation = this.driftDirection = this.driftReadiness = 0;
    this.driftTransition = this.driftBlend = 0;
    // An upside-down rail impact must not become a long fall out of bounds.
    // The physics stays correct, and the race asks for a quick recovery.
    if (!lip && this.railAge < 0.25 && this.up.y < -0.25)
      this.crashFlightAge = 0;
    this.angularVelocity.copy(this.groundRotation);
    this.contactMask = 0;
    this.frontLoad = this.rearLoad = 0;
    this.grounded = false;
    this.normalLoad = 0;
  }
  /** Resolve guardrail contact for this step. Returns true if a rail was hit. */
  private collideRails(old: Vector3, dt: number) {
    const road = nearest(this.position, this.progress);
    if (inGap(road.t)) return false;
    return this.grounded
      ? this.slideAlongRail(old, road, dt)
      : this.strikeRailInFlight(old, road, dt);
  }

  /** A grounded car stays on the deck. The rail removes the outward part of
   * its momentum and adds friction; it never steers the chassis. */
  private slideAlongRail(old: Vector3, road: RoadContact, dt: number) {
    const limit = roadWidth(road.t) / 2 - H.chassisHalfWidth;
    if (Math.abs(road.lateral) <= limit) return false;
    const start = old.clone().sub(road.p).dot(road.right);
    const boundary = Math.sign(road.lateral) * limit;
    const fraction = Math.max(
      0,
      Math.min(1, (boundary - start) / (road.lateral - start || 1)),
    );
    this.position.copy(old.clone().lerp(this.position, fraction));
    // Move the car out by the overlap only. It stays on the deck and keeps
    // its heading.
    const contact = nearest(this.position, this.progress);
    const overlap =
      Math.abs(contact.lateral) -
      (roadWidth(contact.t) / 2 - H.chassisHalfWidth);
    if (overlap > 0)
      this.position.addScaledVector(
        contact.right,
        -Math.sign(contact.lateral) * (overlap + 0.002),
      );
    const outward = Math.sign(contact.lateral);
    const normalSpeed = this.velocity.dot(contact.right) * outward;
    this.railContact = true;
    this.railAge = 0;
    this.railImpact = Math.max(this.railImpact, Math.min(1, normalSpeed / 35));
    if (normalSpeed > 0)
      this.velocity.addScaledVector(contact.right, -outward * normalSpeed);
    const tangentSpeed = this.velocity.length();
    const friction = Math.max(0, normalSpeed) * H.railFriction;
    this.velocity.multiplyScalar(
      Math.max(0, tangentSpeed - friction) / (tangentSpeed || 1),
    );
    // Contact limits movement and never steers the chassis. The drive
    // direction keeps its sign, so a reverse into a rail cannot turn forward.
    if (this.velocity.length() <= 0.12) this.velocity.set(0, 0, 0);
    this.yawRate *= Math.min(1, this.velocity.length() / 5);
    this.position.addScaledVector(this.velocity, dt * (1 - fraction));
    const slide = nearest(this.position);
    const excess =
      Math.abs(slide.lateral) - (roadWidth(slide.t) / 2 - H.chassisHalfWidth);
    if (excess > 0 && !inGap(slide.t))
      this.position.addScaledVector(
        slide.right,
        -Math.sign(slide.lateral) * (excess + 0.002),
      );
    this.angularVelocity.set(0, 0, 0);
    this.boost = 0;
    return true;
    return true;
  }

  /** An airborne car sweeps its footprint against both rails, expanded by the
   * chassis half-width and half-height, and resolves the first contact. */
  private strikeRailInFlight(old: Vector3, road: RoadContact, dt: number) {
    // Sweep the footprint of the car against each rail. The rail box grows by
    // the half-width and the half-height of the chassis.
    const start = old.clone().sub(road.p);
    const end = this.position.clone().sub(road.p);
    const from = [start.dot(road.right), start.dot(road.up)];
    const to = [end.dot(road.right), end.dot(road.up)];
    let first = 2;
    let normal = new Vector3();
    let railSide = 0;
    for (const side of [-1, 1]) {
      const center = side * (roadWidth(road.t) / 2 + 0.45);
      const low = [center - 1.74, -0.5];
      const high = [center + 1.74, 1.8];
      let enter = -Infinity,
        leave = Infinity;
      let face = new Vector3();
      for (let axis = 0; axis < 2; axis++) {
        const delta = to[axis] - from[axis];
        if (Math.abs(delta) < 1e-9) {
          if (from[axis] < low[axis] || from[axis] > high[axis])
            leave = -Infinity;
          continue;
        }
        const a = (low[axis] - from[axis]) / delta;
        const b = (high[axis] - from[axis]) / delta;
        const near = Math.min(a, b);
        if (near > enter) {
          enter = near;
          face
            .copy(axis === 0 ? road.right : road.up)
            .multiplyScalar(delta > 0 ? -1 : 1);
        }
        leave = Math.min(leave, Math.max(a, b));
      }
      if (enter >= 0 && enter <= 1 && enter <= leave && enter < first) {
        first = enter;
        normal.copy(face);
        railSide = side;
      }
    }
    if (first > 1) return false;
    const impact = -this.velocity.dot(normal);
    if (impact <= 0) return false;
    this.railContact = true;
    this.railAge = 0;
    if (this.up.y < -0.25) this.crashFlightAge ??= 0;
    this.railImpact = Math.max(this.railImpact, Math.min(1, impact / 35));
    this.position
      .copy(old)
      .lerp(end.add(road.p), first)
      .addScaledVector(normal, 0.002);
    const tangent = this.velocity.clone().addScaledVector(normal, impact);
    const friction = Math.min(0.55, impact * 0.018);
    this.velocity
      .copy(tangent)
      .multiplyScalar(1 - friction)
      .addScaledVector(normal, impact * 0.28);
    this.position.addScaledVector(this.velocity, dt * (1 - first));
    // An impulse away from the centre pitches and rolls the chassis. Air
    // control can correct the attitude, but it cannot recover lost momentum.
    const lever = road.right
      .clone()
      .multiplyScalar(railSide * 1.3)
      .addScaledVector(road.up, -0.65);
    this.angularVelocity
      .add(lever.cross(normal).multiplyScalar(impact * 0.09))
      .clampLength(0, H.impactMaxSpin);
    this.boost = 0;
    this.grounded = false;
    return true;
  }
}
