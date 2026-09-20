import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { ObstructionSweep } from "./obstructions";

export const CAMERA_NAMES = ["OVERVIEW", "CLOSE", "INTERIOR"] as const;
export type CameraPreset = 0 | 1 | 2;
const defaultCameraSettings = {
  preset: 0 as CameraPreset,
  fov: 70,
  speedFov: false,
};
export type CameraSettings = typeof defaultCameraSettings;
export function cameraSettings(value: unknown): CameraSettings {
  const v = (value ?? {}) as Partial<CameraSettings>;
  return {
    preset: v.preset === 1 || v.preset === 2 ? v.preset : 0,
    fov:
      typeof v.fov === "number" && Number.isFinite(v.fov)
        ? Math.max(55, Math.min(85, v.fov))
        : 70,
    speedFov: v.speedFov === true,
  };
}
export function orientation(heading: Vector3, up: Vector3) {
  const right = heading.clone().cross(up).normalize();
  return new Quaternion()
    .setFromRotationMatrix(
      new Matrix4().makeBasis(
        right,
        right.clone().cross(heading).normalize(),
        heading.clone().negate(),
      ),
    )
    .normalize();
}
type CameraCar = {
  position: Vector3;
  heading: Vector3;
  up: Vector3;
  velocity?: Vector3;
  speed: number;
  grounded?: boolean;
};
/** Chase and interior cameras. The controller advances at the 120 Hz of the
 * simulation; a render frame only interpolates between two of its states. */
export class CameraController {
  settings = { ...defaultCameraSettings };
  preset: CameraPreset = 0;
  ready = false;
  position = new Vector3();
  rotation = new Quaternion();
  private previousPosition = new Vector3();
  private previousRotation = new Quaternion();
  private reference = new Quaternion();
  private distanceFraction = 1;
  private fov = 70;
  private previousFov = 70;
  constructor(private sweep: ObstructionSweep = () => 1) {}
  /** Point the clearance sweep at another course. */
  set obstructions(sweep: ObstructionSweep) {
    this.sweep = sweep;
  }
  reset() {
    this.ready = false;
  }
  update(car: CameraCar, dt: number) {
    this.previousPosition.copy(this.position);
    this.previousRotation.copy(this.rotation);
    this.previousFov = this.fov;
    const chassis = orientation(car.heading, car.up);
    if (!this.ready) this.reference.copy(chassis);
    if (this.preset === 0) {
      if (car.grounded !== false) {
        const travel =
          car.velocity && car.velocity.dot(car.heading) > 2
            ? car.velocity.clone().normalize()
            : car.heading.clone();
        const target = orientation(travel, car.up);
        this.reference.slerp(target, this.ready ? 1 - Math.exp(-8 * dt) : 1);
      }
    } else this.reference.copy(chassis);
    const heading = new Vector3(0, 0, -1).applyQuaternion(this.reference);
    const up = new Vector3(0, 1, 0).applyQuaternion(this.reference);
    if (this.preset === 2) {
      this.position
        .copy(car.position)
        .addScaledVector(up, 0.73)
        .addScaledVector(heading, 0.15);
      this.rotation.copy(chassis);
    } else {
      const close = this.preset === 1;
      const anchor = car.position.clone().addScaledVector(up, 0.8);
      const wanted = car.position
        .clone()
        .addScaledVector(heading, close ? -8 : -12)
        .addScaledVector(up, close ? 3 : 5);
      const allowed = this.sweep(anchor, wanted);
      this.distanceFraction =
        !this.ready || allowed < this.distanceFraction
          ? allowed
          : this.distanceFraction +
            (allowed - this.distanceFraction) * (1 - Math.exp(-3 * dt));
      this.position.copy(anchor).lerp(wanted, this.distanceFraction);
      const look = car.position
        .clone()
        .addScaledVector(heading, close ? 8 : 11)
        .addScaledVector(up, 1);
      const rotation = orientation(look.sub(this.position).normalize(), up);
      this.rotation.slerp(
        rotation,
        this.ready ? 1 - Math.exp(-(close ? 20 : 12) * dt) : 1,
      );
    }
    this.fov =
      this.settings.fov +
      (this.settings.speedFov ? Math.min(10, Math.abs(car.speed) / 9) : 0);
    if (!this.ready) {
      this.previousPosition.copy(this.position);
      this.previousRotation.copy(this.rotation);
      this.previousFov = this.fov;
    }
    this.ready = true;
  }
  apply(camera: PerspectiveCamera, alpha = 1) {
    camera.position.copy(this.previousPosition).lerp(this.position, alpha);
    camera.quaternion.copy(this.previousRotation).slerp(this.rotation, alpha);
    camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const fov = this.previousFov + (this.fov - this.previousFov) * alpha;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }
}
