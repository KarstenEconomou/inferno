import * as THREE from "three";
import { frame, lane, length, roadWidth, samples, track } from "../../track";
import { BOOST_PAD } from "../../track/markers";
import { align, box } from "../geometry";
import { paint } from "./surfaces";
import type { sign } from "./signs";

export type SignFactory = typeof sign;

/** A group placed on the road at station `t`, aligned with the road frame. */
export function anchor(root: THREE.Group, t: number) {
  const group = new THREE.Group();
  const f = frame(t);
  group.userData.trackT = t;
  group.position.copy(f.p);
  align(group, f);
  root.add(group);
  return group;
}

export function plane(w: number, h: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
}

/** Low trackside blocks. They give the road perspective without a forest of
 * poles. One block goes on each side, every fourteenth road sample. */
export function buildMarkerPosts(root: THREE.Group) {
  for (let i = 0; i < samples.length; i += 14) {
    const f = samples[i];
    if (f.gap) continue;
    for (const side of [-1, 1]) {
      const post = box(0.32, 1.18, 0.32, paint.steel, "red");
      post.position
        .copy(f.p)
        .addScaledVector(f.right, side * (roadWidth(f.t) / 2 + 0.45))
        .addScaledVector(f.up, 0.57);
      align(post, f);
      root.add(post);
    }
  }
}

/** Boost pads are identified by their forward chevrons, without text. A pad
 * sits on the painted lane, so a course that paints its road off the middle
 * of a wider corridor keeps its pads on the paint. */
export function buildBoostPads(root: THREE.Group) {
  for (const t of track.boosts) {
    const group = anchor(root, t);
    group.position.addScaledVector(frame(t).right, lane(t).offset);
    for (let row = 0; row < BOOST_PAD.rows; row++)
      for (const side of [-1, 1]) {
        const stripe = box(
          BOOST_PAD.stripeWidth,
          0.035,
          BOOST_PAD.stripeDepth,
          paint.green,
        );
        stripe.position.set(
          side * BOOST_PAD.sideOffset,
          0.07,
          (row - (BOOST_PAD.rows - 1) / 2) * BOOST_PAD.rowSpacing,
        );
        stripe.rotation.y = -side * BOOST_PAD.angle;
        group.add(stripe);
      }
  }
}

/** Gap approach, lips and landing corridor. Bright marks let the driver read
 * the gap even when the next platform is aligned with a blue sky. */
export function buildGapMarkings(root: THREE.Group) {
  for (const [a, b] of track.gaps) {
    // A short landing corridor stays readable without hiding the racing line.
    for (let row = 0; row < 3; row++) {
      const t = b + (5 + row * 8) / length,
        f = frame(t);
      for (const side of [-1, 1]) {
        const mark = box(0.32, 0.035, 4, paint.green);
        mark.position
          .copy(f.p)
          .addScaledVector(f.right, side * (roadWidth(t) / 2 - 2.2))
          .addScaledVector(f.up, 0.065);
        align(mark, f);
        root.add(mark);
      }
    }
    for (const t of [a - 0.00065, b + 0.0008]) {
      const group = anchor(root, t);
      const bar = box(roadWidth(t), 0.08, 0.65, paint.green);
      bar.position.y = 0.06;
      group.add(bar);
    }
  }
}

/** Start line and checkpoint gates. The labels are short and readable;
 * vermilion frames surround acid-green type. */
export function buildGates(root: THREE.Group, makeSign: SignFactory) {
  [0, ...track.checkpoints].forEach((t, index) => {
    const group = anchor(root, t);
    const w = roadWidth(t) + 2;
    for (const side of [-1, 1]) {
      const pillar = box(1, 7.4, 1.2, paint.steel, "red");
      pillar.position.set((side * w) / 2, 3.7, 0);
      group.add(pillar);
      const cap = box(0.22, 5, 0.05, paint.green);
      cap.position.set((side * w) / 2, 3, 0.63);
      group.add(cap);
      const foot = box(2.1, 0.7, 2.1, paint.steel, "red");
      foot.position.set((side * w) / 2, 0.35, 0);
      group.add(foot);
    }
    const crossbar = box(w + 1, 1.65, 1, paint.blue, "red");
    crossbar.position.y = 7.3;
    group.add(crossbar);
    const label = plane(
      w - 1,
      1.35,
      // The gate over the grid names the circuit it stands on, the way the
      // gantry at a real start line carries the name of the place.
      makeSign(index ? `CHECKPOINT 0${index}` : track.name.toUpperCase()),
    );
    label.position.set(0, 7.3, 0.515);
    group.add(label);
    for (const side of [-1, 1]) {
      const stroke = box(0.15, 1.65, 0.04, paint.green);
      stroke.position.set(side * (w / 2 - 1), 7.3, 0.53);
      group.add(stroke);
    }
    if (index === 0)
      for (let x = -9; x < 10; x++)
        for (let z = 0; z < 2; z++) {
          const tile = box(1, 0.035, 1, (x + z) % 2 ? paint.green : paint.blue);
          tile.position.set(x, 0.055, -z);
          group.add(tile);
        }
  });
}
