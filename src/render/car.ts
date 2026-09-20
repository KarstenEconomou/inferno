import * as THREE from "three";
import { inkColor, printed, solid } from "./ink";
import { box, outlined } from "./geometry";
import { WheelAnimation, WHEEL_RADIUS, type WheelRig } from "./wheels";

function hull(points: number[][]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flat(), 3),
  );
  geometry.setIndex([
    0, 1, 2, 0, 2, 3, 4, 7, 6, 4, 6, 5, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0,
    3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2,
  ]);
  const panels = geometry.toNonIndexed();
  panels.computeVertexNormals();
  return panels;
}
/** Build the car. The ghost form replaces every material with one wireframe,
 * so the recorded run stays readable through the solid car. */
export function makeCar(ghost = false) {
  const car = new THREE.Group();
  const wheels = new Set<THREE.Object3D>();
  const rigs: WheelRig[] = [];
  const ink = {
    body: printed("green", "car"),
    blue: solid("blue"),
    green: solid("green"),
    red: solid("red"),
  };
  const wire = new THREE.MeshBasicMaterial({
    color: inkColor("green"),
    wireframe: true,
    toneMapped: false,
  });
  wire.transparent = true;
  wire.opacity = 0.8;
  wire.depthWrite = false;
  function shape(geometry: THREE.BufferGeometry, material: THREE.Material) {
    return ghost
      ? new THREE.Mesh(geometry, wire)
      : outlined(geometry, material, "green");
  }
  function part(
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) {
    const object = box(w, h, d, ghost ? wire : material);
    object.position.set(x, y, z);
    car.add(object);
    return object;
  }
  const body = hull([
    [-1, -0.25, -2.2],
    [1, -0.25, -2.2],
    [1.05, -0.25, 2.05],
    [-1.05, -0.25, 2.05],
    [-0.93, 0.12, -2.2],
    [0.93, 0.12, -2.2],
    [1.05, 0.4, 1.95],
    [-1.05, 0.4, 1.95],
  ]);
  car.add(shape(body, ink.body));
  const cabin = hull([
    [-0.82, 0.33, -0.85],
    [0.82, 0.33, -0.85],
    [0.85, 0.38, 1.05],
    [-0.85, 0.38, 1.05],
    [-0.62, 0.93, -0.13],
    [0.62, 0.93, -0.13],
    [0.69, 0.9, 0.64],
    [-0.69, 0.9, 0.64],
  ]);
  car.add(shape(cabin, ink.blue));
  part(1.27, 0.045, 0.65, ink.green, 0, 0.925, 0.2);
  part(0.18, 0.018, 1.12, ink.blue, 0, 0.26, -1.34).rotation.x = 0.12;
  // Rear glass and parallel louvres. They keep the mechanical line work of
  // the body.
  for (let i = 0; i < 4; i++) {
    const slat = part(
      1.47,
      0.04,
      0.07,
      ink.green,
      0,
      0.79 - i * 0.1,
      0.75 + i * 0.09,
    );
    slat.rotation.x = -0.6;
  }
  part(2.16, 0.2, 0.22, ink.blue, 0, -0.17, 2.08);
  for (const x of [-0.75, 0.75]) {
    part(0.51, 0.12, 0.035, ink.red, x, 0.23, 2.065);
    part(0.1, 0.46, 0.15, ink.green, x, 0.57, 1.7);
    part(0.12, 0.06, 1.2, ink.green, x, 0.31, -1.1);
    part(0.45, 0.09, 0.035, ink.green, x, 0.03, -2.22);
  }
  const wing = shape(new THREE.BoxGeometry(2.55, 0.1, 0.48), ink.green);
  wing.position.set(0, 0.81, 1.75);
  car.add(wing);
  for (const side of [-1, 1]) {
    part(0.035, 0.08, 2.1, ink.green, side * 1.055, -0.12, 0.2);
    for (let j = 0; j < 3; j++)
      part(0.035, 0.04, 0.25, ink.red, side * 1.06, 0.27 - j * 0.07, 1.05);
    for (const z of [-1.3, 1.35]) {
      const pivot = new THREE.Group();
      pivot.name = `wheel-${z < 0 ? "front" : "rear"}-${side < 0 ? "left" : "right"}`;
      pivot.position.set(side * 1.065, -0.15, z);
      const rolling = new THREE.Group();
      rolling.name = "wheel-roll";
      pivot.add(rolling);
      car.add(pivot);
      wheels.add(pivot);
      rigs.push({ pivot, rolling, front: z < 0 });
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.34, 16),
        ghost ? wire : ink.blue,
      );
      wheel.rotation.z = Math.PI / 2;
      rolling.add(wheel);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.345, 0.045, 4, 16),
        ghost ? wire : ink.green,
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.x = side * (1.24 - 1.065);
      rolling.add(ring);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.025, 8),
        ghost ? wire : ink.red,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.x = side * (1.25 - 1.065);
      rolling.add(hub);
      for (let spoke = 0; spoke < 3; spoke++) {
        const strut = box(0.025, 0.56, 0.045, ghost ? wire : ink.red);
        strut.position.x = side * (1.255 - 1.065);
        rolling.add(strut);
        strut.rotation.x = (spoke * Math.PI) / 3;
      }
    }
  }
  const bodyGroup = new THREE.Group();
  bodyGroup.name = "suspension-body";
  for (const child of [...car.children])
    if (!wheels.has(child)) bodyGroup.add(child);
  car.add(bodyGroup);
  return Object.assign(car, { wheelAnimation: new WheelAnimation(rigs) });
}
