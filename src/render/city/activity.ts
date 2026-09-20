import * as THREE from "three";
import { solid } from "../ink";
import { CITY_GROUND, type CityPlan } from "./plan";

/** Sparse district traffic: one service truck for several blocks, and only in
 * the reserved margin of an alley. A course with no district has no traffic,
 * and reports an empty group the frame loop can still drive. */
export function buildCityActivity(plan: CityPlan | null) {
  const root = new THREE.Group();
  root.name = "district service traffic";
  if (!plan) return { root, update: () => {}, plots: [] };
  const plots = plan.plots.filter(
    (p) => p.layer === "district" && p.id % 13 === 0 && p.width > 20,
  );
  const shuttles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.8, 1.3, 1.2),
    solid("red"),
    plots.length,
  );
  root.add(shuttles);
  const pose = new THREE.Object3D();
  function update(time: number) {
    plots.forEach((p, i) => {
      pose.position.set(
        p.x + Math.sin(time * 0.12 + i * 2.3) * (p.width / 2 - 3),
        CITY_GROUND + 0.7,
        p.z + p.depth / 2 - 0.85,
      );
      pose.rotation.set(0, 0, 0);
      pose.updateMatrix();
      shuttles.setMatrixAt(i, pose.matrix);
    });
    shuttles.instanceMatrix.needsUpdate = true;
  }
  update(0);
  // The bounds cover the full path of each truck, not only its start.
  shuttles.boundingBox = new THREE.Box3();
  for (const p of plots) shuttles.boundingBox.union(p.bounds);
  shuttles.boundingSphere = shuttles.boundingBox.getBoundingSphere(
    new THREE.Sphere(),
  );
  return { root, update, plots };
}
