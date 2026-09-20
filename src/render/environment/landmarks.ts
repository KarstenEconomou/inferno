import * as THREE from "three";
import { frame, roadWidth, track } from "../../track";
import { align, box } from "../geometry";
import { solid, printed } from "../ink";

const steel = printed("red"),
  blue = solid("blue");
type Point = [number, number, number];

/** A shared bolted outrigger carries every overhead assembly. Its clamp bites
 * the deck fascia below the driving surface; the mast sits outside the rail.
 * These are track-local parts, so the attachment follows banking and grade. */
function assembly(root: THREE.Group, t: number, name: string) {
  const f = frame(t),
    half = roadWidth(t) / 2,
    outer = half + 2.4;
  const g = new THREE.Group();
  g.name = name;
  g.userData.trackT = t;
  g.position.copy(f.p);
  align(g, f);
  root.add(g);
  const block = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z = 0,
    material: THREE.Material = steel,
  ) => {
    const m = box(w, h, d, material, "red");
    m.name = `${name}:${g.children.length}`;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const beam = (
    a: Point,
    b: Point,
    width = 0.45,
    material: THREE.Material = steel,
  ) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const m = block(width, start.distanceTo(end), width, 0, 0, 0, material);
    m.position.copy(start).add(end).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      end.sub(start).normalize(),
    );
    return m;
  };
  const mount = (side: number, top: number) => {
    // Paired saddle plates visibly clasp the deck's 1.4m slab.
    const clamp = block(2.1, 0.32, 3.2, side * (half - 0.05), -1.28);
    clamp.name = `${name}:deck-clamp:${side}`;
    clamp.userData.deckClamp = side;
    block(0.35, 1.4, 3.2, side * (half + 0.6), -1.25);
    block(3.5, 0.48, 3.2, side * (half + 0.7), -1.9);
    // Box-section mast and triangular knee, not a pole floating beside the road.
    block(0.95, top + 1.7, 1.4, side * outer, (top - 1.7) / 2, 0, blue);
    for (const z of [-0.72, 0.72])
      block(0.95, top + 1.7, 0.16, side * outer, (top - 1.7) / 2, z);
    beam([side * (half + 0.35), -1.7, 0], [side * outer, 1.4, 0], 0.55);
    for (const z of [-1.05, 1.05])
      block(0.38, 0.45, 0.35, side * (half + 0.8), -1.25, z, blue);
    block(1.7, 0.35, 2.1, side * outer, top);
  };
  const truss = (height: number, depth = 2) => {
    // Two flanges and alternating diagonals read as fabricated steel, with
    // empty space through the web instead of a heavy continuous roof panel.
    for (const y of [height, height + 1.4])
      block(outer * 2 + 0.8, 0.28, depth, 0, y);
    const bays = Math.ceil((outer * 2) / 4.5);
    for (let i = 0; i < bays; i++) {
      const a = -outer + (outer * 2 * i) / bays;
      const b = -outer + (outer * 2 * (i + 1)) / bays;
      for (const z of [-depth / 2, depth / 2])
        beam(
          [a, height + (i % 2 ? 1.4 : 0), z],
          [b, height + (i % 2 ? 0 : 1.4), z],
          0.2,
        );
    }
  };
  return { g, f, half, outer, block, beam, mount, truss };
}

/** Three short infrastructure sequences: maintenance booms, open service
 * bridges and process-pipe gantries. All loads visibly return to deck clamps. */
export function buildLandmarks() {
  const root = new THREE.Group();
  root.name = "track-landmarks";
  for (const landmark of track.landmarks ?? [])
    for (let i = 0; i < landmark.count; i++) {
      const t = landmark.start + i * landmark.spacing;
      const { g, half, outer, block, beam, mount, truss } = assembly(
        root,
        t,
        `${landmark.kind}-${i}`,
      );
      if (landmark.kind === "cantilever") {
        mount(-1, 10.2);
        const tip = half * 0.32;
        // Triangulated maintenance boom with a rail-mounted trolley and hoist.
        beam([-outer, 8.1, 0], [tip, 10.2, 0], 0.5);
        block(outer + tip + 0.5, 0.5, 1.8, (tip - outer) / 2, 10.2);
        block(2.3, 0.9, 2.1, tip - 1.7, 9.75, 0, blue);
        block(0.18, 1.2, 0.18, tip - 1.7, 8.75);
        block(1.1, 0.35, 0.65, tip - 1.7, 8.05);
        // Braced backstay joins the same column and the outer end of the boom.
        beam([-outer, 5.8, -0.65], [-outer + 4.5, 10.2, -0.65], 0.35);
      } else if (landmark.kind === "rib-vault") {
        mount(-1, 10.6);
        mount(1, 10.6);
        truss(10.6, 2.6);
        for (const side of [-1, 1])
          beam([side * outer, 7.7, 0], [side * (outer - 3.6), 10.6, 0], 0.55);
        // A narrow maintenance walkway and side equipment cabinet.
        block(outer * 2, 0.2, 2.4, 0, 10.8, 0, blue);
        block(2.2, 1.4, 1.8, -outer + 2.5, 11.6, 0, blue);
      } else {
        mount(-1, 10.6);
        mount(1, 10.6);
        block(outer * 2 + 0.8, 0.7, 3.2, 0, 10.6, 0, blue);
        for (const z of [-0.95, 0.95]) {
          const pipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.62, 0.62, outer * 2 + 0.6, 10),
            blue,
          );
          pipe.userData.outline = "red";
          pipe.rotation.z = Math.PI / 2;
          pipe.position.set(0, 11.55, z);
          g.add(pipe);
          for (const x of [-outer, -outer / 2, 0, outer / 2, outer]) {
            // Saddle feet, flange and pipe physically touch one another.
            block(0.5, 0.5, 1.5, x, 11.1, z);
            const collar = new THREE.Mesh(
              new THREE.TorusGeometry(0.69, 0.13, 4, 12),
              steel,
            );
            collar.rotation.y = Math.PI / 2;
            collar.position.set(x, 11.55, z);
            g.add(collar);
          }
        }
        for (const side of [-1, 1])
          beam([side * outer, 7.8, 0], [side * (outer - 3), 10.6, 0], 0.5);
      }
    }
  return root;
}

/** The gallery is a continuous cable/maintenance rack, anchored to the deck.
 * Longitudinal members follow the actual banked road instead of floating
 * straight rafters that stop short of the next frame. */
export function buildGallery() {
  const root = new THREE.Group();
  root.name = "track-service-gallery";
  const gallery = track.gallery;
  if (!gallery) return root;
  for (let i = 0; i < gallery.count; i++) {
    const t = gallery.start + i * gallery.spacing;
    const { g, f, outer, block, beam, mount, truss } = assembly(
      root,
      t,
      `service-rack-${i}`,
    );
    mount(-1, 9.4);
    mount(1, 9.4);
    truss(9.4, 1.6);
    for (const side of [-1, 1])
      beam([side * outer, 6.7, 0], [side * (outer - 3.1), 9.4, 0], 0.45);
    if (i % 3 === 1) {
      // One small hoist per three bays, attached to the bottom truss flange.
      block(3, 0.85, 2, 0, 8.98, 0, blue);
      block(0.16, 1.1, 0.16, 0, 8.02);
      block(1, 0.3, 0.6, 0, 7.35);
    }
    if (i + 1 < gallery.count) {
      const inverse = g.quaternion.clone().invert();
      const localPoint = (progress: number, side: number, y: number) => {
        const next = frame(progress);
        return next.p
          .clone()
          .addScaledVector(next.right, side * (roadWidth(progress) / 2 + 2.4))
          .addScaledVector(next.up, y)
          .sub(f.p)
          .applyQuaternion(inverse)
          .toArray() as Point;
      };
      for (const side of [-1, 1])
        for (const y of [9.4, 10.8])
          for (let j = 0; j < 4; j++)
            beam(
              localPoint(t + (gallery.spacing * j) / 4, side, y),
              localPoint(t + (gallery.spacing * (j + 1)) / 4, side, y),
              0.32,
            );
    }
  }
  return root;
}
