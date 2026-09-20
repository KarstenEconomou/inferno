import { Box3, Matrix4, Mesh, Object3D } from "three";
import { OBB } from "three/addons/math/OBB.js";
import type { createTrack } from "./compile";
export interface DrivingVolume {
  bounds: Box3;
  oriented: OBB;
}
function transformedBounds(bounds: Box3, matrix: Matrix4) {
  const result = new OBB().fromBox3(bounds);
  // The OBB helper scales and rotates the extents, but it only moves the
  // centre. A road volume has a centre away from the origin, so the centre
  // needs its own transform.
  const center = result.center.clone().applyMatrix4(matrix);
  result.applyMatrix4(matrix);
  result.center.copy(center);
  return result;
}

/** Bounds of the driveable road, with space for the car above the deck.
 *
 * Test an asset before the renderer batches it, while the asset still has its
 * own mesh bounds. The test is deliberately generous: an unnecessary hit only
 * removes a piece of scenery, but a missed hit would block the race. */
export function drivingEnvelope(
  course: ReturnType<typeof createTrack>,
  excludeNear?: number,
) {
  return course.samples.flatMap((a, i) => {
    if (excludeNear !== undefined) {
      const delta = Math.abs(a.t - excludeNear);
      if (Math.min(delta, 1 - delta) * course.length < 60) return [];
    }
    const b = course.samples[(i + 1) % course.samples.length];
    if (course.inGap(a.t + 0.5 / course.samples.length)) return [];
    const corners = [a, b].flatMap((f) =>
      [-1, 1].flatMap((side) =>
        [0.15, 4.5].map((y) =>
          f.p
            .clone()
            .addScaledVector(f.right, side * (course.roadWidth(f.t) / 2 - 0.8))
            .addScaledVector(f.up, y),
        ),
      ),
    );
    // An axis-aligned box around a banked section also holds large empty
    // wedges beside it. The box is the first, cheap test; the oriented box is
    // the second. Both ends together contain the full swept volume.
    const mid = course.frame(a.t + 0.5 / course.samples.length);
    const transform = new Matrix4()
      .makeBasis(mid.right, mid.up, mid.forward.clone().negate())
      .setPosition(mid.p);
    const inverse = transform.clone().invert();
    const local = new Box3()
      .setFromPoints(corners.map((p) => p.clone().applyMatrix4(inverse)))
      .expandByScalar(0.05);
    return [
      {
        bounds: new Box3().setFromPoints(corners).expandByScalar(0.1),
        oriented: transformedBounds(local, transform),
      },
    ];
  });
}
export function assetIntersections(asset: Object3D, envelope: DrivingVolume[]) {
  asset.updateWorldMatrix(true, true);
  const intersections: { name: string; segment: number }[] = [];
  asset.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.computeBoundingBox();
    const bounds = object.geometry
      .boundingBox!.clone()
      .applyMatrix4(object.matrixWorld);
    const oriented = transformedBounds(
      object.geometry.boundingBox!,
      object.matrixWorld,
    );
    envelope.forEach((road, segment) => {
      if (
        bounds.intersectsBox(road.bounds) &&
        oriented.intersectsOBB(road.oriented)
      )
        intersections.push({ name: object.name || asset.name, segment });
    });
  });
  return intersections;
}
