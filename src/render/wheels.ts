import { Group, Vector3 } from "three";

export const WHEEL_RADIUS = 0.5;
export type WheelRig = { pivot: Group; rolling: Group; front: boolean };

/** Pose-driven rolling stays still when paused and works with old replays. */
export class WheelAnimation {
  private previous: Vector3 | null = null;
  private heading = new Vector3();
  private travel = new Vector3();
  private direction = new Vector3();
  private angle = 0;

  constructor(readonly rigs: WheelRig[]) {}

  reset() {
    this.previous = null;
    this.angle = 0;
    for (const { pivot, rolling } of this.rigs) {
      pivot.rotation.y = 0;
      rolling.rotation.x = 0;
    }
  }

  update(position: Vector3, heading: Vector3, steeringAngle = 0) {
    if (this.previous) {
      this.travel.subVectors(position, this.previous);
      this.direction.copy(this.heading).add(heading).normalize();
      // Forward is local -Z, so a forward roll is a negative X rotation.
      this.angle =
        (this.angle - this.travel.dot(this.direction) / WHEEL_RADIUS) %
        (Math.PI * 2);
    } else this.previous = new Vector3();
    this.previous.copy(position);
    this.heading.copy(heading);
    for (const { pivot, rolling, front } of this.rigs) {
      pivot.rotation.y = front ? steeringAngle : 0;
      rolling.rotation.x = this.angle;
    }
  }
}
