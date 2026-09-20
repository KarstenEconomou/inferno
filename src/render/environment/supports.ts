import * as THREE from "three";
import { course, frame, inGap, length, roadWidth, samples } from "../../track";
import { printed } from "../ink";
import { box } from "../geometry";
import { assetIntersections, drivingEnvelope } from "../../track/clearance";
const paint = { steel: printed("red"), concrete: printed("red", "concrete") };
function beamBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  width: number,
  material: THREE.Material,
) {
  const mesh = box(width, a.distanceTo(b), width, material, "red");
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  return mesh;
}

export function buildSupports() {
  const root = new THREE.Group();
  const envelope = drivingEnvelope(course);
  // Piers stand far apart and fully below the lowest banked road edge. No
  // column can come through the driving surface.
  const count = Math.ceil(length / 48);
  for (let i = 0; i < count; i++) {
    const t = i / count;
    if (inGap(t)) continue;
    const f = frame(t);
    // Leave out the whole assembly when another branch of the course passes
    // below. The test includes the cap, the braces and the driving envelope.
    if (
      samples.some((s) => {
        const arc = Math.min(Math.abs(s.t - t), 1 - Math.abs(s.t - t)) * length;
        return (
          arc > 60 &&
          Math.hypot(s.p.x - f.p.x, s.p.z - f.p.z) < roadWidth(s.t) / 2 + 22
        );
      })
    )
      continue;
    const assembly = new THREE.Group();
    assembly.name = `pier-${i}`;
    const anchors = [-1, 1].map((side) =>
      f.p
        .clone()
        .addScaledVector(f.right, side * (roadWidth(t) / 2 + 8))
        .addScaledVector(f.up, -6),
    );
    assembly.add(beamBetween(anchors[0], anchors[1], 1.4, paint.steel));
    for (const anchor of anchors) {
      const ground = new THREE.Vector3(anchor.x, -52, anchor.z);
      assembly.add(beamBetween(ground, anchor, 2.5, paint.concrete));
    }
    if (!assetIntersections(assembly, envelope).length) root.add(assembly);
  }
  return root;
}
