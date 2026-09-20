import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { lineInk, type Ink } from "./ink";
import { frame } from "../track";

/** Shared geometry helpers: a unit box for every rectangular part, frame
 * alignment, outlined shapes, and the batching of static architecture. */
const unitBox = new THREE.BoxGeometry(1, 1, 1);
/** Crease angle, in degrees, above which an edge becomes a drawn contour. */
const EDGE_THRESHOLD = 25;
const lines = {
  red: lineInk("red"),
  green: lineInk("green"),
  blue: lineInk("blue"),
};
/** The shared contour material of one ink. Drawn lines belong to the same
 * three inks as the surfaces, and a circuit change repaints them in place. */
export const inkLine = (ink: Ink) => lines[ink];
export function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  outline?: Ink,
) {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.scale.set(w, h, d);
  if (outline) mesh.userData.outline = outline;
  return mesh;
}
export function align(object: THREE.Object3D, f: ReturnType<typeof frame>) {
  object.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(f.right, f.up, f.forward.clone().negate()),
  );
}
export function outlined(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  ink: Ink,
) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  group.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, EDGE_THRESHOLD),
      lines[ink],
    ),
  );
  return group;
}
/** Bake repeated static architecture into few draw calls. Contours stay
 * separate, so hidden edges obey the same depth buffer as the faces.
 *
 * The district reuses a handful of source geometries thousands of times, so
 * each source is expanded and outlined once and then copied per instance.
 */
export function bake(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const batches = new Map<string, THREE.BufferGeometry[]>();
  const batchMaterial = new Map<string, THREE.Material>();
  const strands = new Map<string, THREE.BufferGeometry[]>();
  const strandMaterial = new Map<string, THREE.Material>();
  const strand = (material: THREE.Material, geometry: THREE.BufferGeometry) => {
    const key = material.uuid;
    if (!strands.has(key)) {
      strands.set(key, []);
      strandMaterial.set(key, material);
    }
    strands.get(key)!.push(geometry);
  };
  const expanded = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const outlines = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const cached = <T>(
    store: Map<THREE.BufferGeometry, THREE.BufferGeometry>,
    key: THREE.BufferGeometry,
    make: () => THREE.BufferGeometry,
  ) => {
    let base = store.get(key);
    if (!base) store.set(key, (base = make()));
    return base.clone() as T;
  };
  root.traverse((object) => {
    // Lines authored in the tree, such as the contours of the desert, are
    // merged by material rather than turned into faces.
    if (object instanceof THREE.LineSegments) {
      const drawn = object.geometry.clone();
      drawn.applyMatrix4(object.matrixWorld);
      strand(object.material as THREE.Material, drawn);
      return;
    }
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.Material;
    const geometry = cached<THREE.BufferGeometry>(
      expanded,
      object.geometry,
      () =>
        object.geometry.index
          ? object.geometry.toNonIndexed()
          : object.geometry.clone(),
    );
    geometry.applyMatrix4(object.matrixWorld);
    if (!geometry.hasAttribute("uv"))
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 2),
          2,
        ),
      );
    if (!geometry.hasAttribute("normal")) geometry.computeVertexNormals();
    const batchKey = material.uuid;
    if (!batches.has(batchKey)) {
      batches.set(batchKey, []);
      batchMaterial.set(batchKey, material);
    }
    batches.get(batchKey)!.push(geometry);
    const ink = object.userData.outline as Ink | undefined;
    if (ink) {
      const contour = cached<THREE.BufferGeometry>(
        outlines,
        object.geometry,
        () => new THREE.EdgesGeometry(object.geometry, EDGE_THRESHOLD),
      );
      contour.applyMatrix4(object.matrixWorld);
      strand(lines[ink], contour);
    }
  });
  const result = new THREE.Group();
  for (const [key, geometries] of batches) {
    const combined = mergeGeometries(geometries);
    if (combined) result.add(new THREE.Mesh(combined, batchMaterial.get(key)!));
    geometries.forEach((g) => g.dispose());
  }
  for (const [key, geometries] of strands) {
    const combined = mergeGeometries(geometries);
    if (combined)
      result.add(new THREE.LineSegments(combined, strandMaterial.get(key)!));
    geometries.forEach((g) => g.dispose());
  }
  for (const base of expanded.values()) base.dispose();
  for (const base of outlines.values()) base.dispose();
  return result;
}
