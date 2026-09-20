import { HANDLING } from "./handling";
import { frame } from "../track";
import type { Input, Vehicle } from "./vehicle";

/** Driving advice for the head-up display. A condition must hold for a short
 * time before the display shows it. Short corrections and slow, deliberate
 * reverses thus stay quiet. */
export class DrivingFeedback {
  private wrongWayAge = 0;
  private stuckAge = 0;
  private railAge = Infinity;
  reset() {
    this.wrongWayAge = this.stuckAge = 0;
    this.railAge = Infinity;
  }
  update(car: Vehicle, input: Input, dt: number) {
    const wrongWay =
      car.grounded &&
      car.velocity.length() > 15 &&
      car.velocity.dot(frame(car.progress).forward) < -8;
    this.wrongWayAge = wrongWay
      ? Math.min(1, this.wrongWayAge + dt)
      : Math.max(0, this.wrongWayAge - dt * 4);
    this.railAge = car.railContact ? 0 : this.railAge + dt;
    const stuck =
      car.grounded &&
      this.railAge < 0.2 &&
      Math.abs(car.speed) < 2 &&
      input.throttle > 0 &&
      !input.brake;
    this.stuckAge = stuck ? this.stuckAge + dt : 0;
  }
  get needsRecovery() {
    return this.wrongWayAge >= 0.8 || this.stuckAge >= 0.75;
  }
  message(car: Vehicle, input: Input) {
    if (this.stuckAge >= 0.75) return "S / ↓ REVERSE · ⌫ RESPAWN";
    if (this.wrongWayAge >= 0.8) return "WRONG WAY · TURN AROUND";
    if (!car.grounded) return "";
    if (car.driftPhase === "drift") return "DRIFT · RELEASE TO GRIP";
    if (
      car.driftPhase === "recovery" &&
      (car.driftBlend > 0 || car.slipIntensity > 0.15)
    )
      return "GRIP RETURNING";
    if (input.brake) {
      if (
        input.throttle > 0 &&
        Math.abs(input.steer) >= HANDLING.driftPreparationSteering &&
        car.velocity.dot(car.heading) >= HANDLING.driftStartSpeed
      )
        return "HOLD STEER + BRAKE TO SLIDE";
      return car.velocity.dot(car.heading) <= HANDLING.driftStartSpeed
        ? "SLIDE AT 191+ KM/H"
        : "STEER, THEN BRAKE TO SLIDE";
    }
    return "";
  }
}
