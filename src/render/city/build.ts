import * as THREE from "three";
import { bake, box } from "../geometry";
import { solid } from "../ink";
import { CITY_GROUND, type CityPlan } from "./plan";

/** A small set of industrial building types. Cobalt masses carry red line
 * work. The near district shows its roofs, and the far skyline shows shallow
 * facades. No dither, texture or extra colour is necessary. */
export function buildCity(plan: CityPlan, batched = true) {
  const root = new THREE.Group();
  root.name = "Vertigo Works — industrial district";
  const blue = solid("blue"),
    red = solid("red");
  for (const p of plan.plots) {
    const g = new THREE.Group();
    g.name = `city-${p.id}`;
    g.userData.cityPlot = p;
    g.position.set(p.x, CITY_GROUND, p.z);
    g.rotation.y = p.rotation;
    root.add(g);
    const w = p.width - 4,
      d = p.depth - 4,
      h = p.height;
    const add = (
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      line = false,
    ) => {
      const mesh = box(
        width,
        height,
        depth,
        line ? red : blue,
        line ? undefined : "red",
      );
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    const roof = h * 0.76;
    if (p.kind === 2) {
      // Pressure-vessel yard. From above it reads as built ground.
      add(w, 3, d, 0, 1.5, 0);
      for (const side of [-1, 1]) {
        const radius = Math.min(w * 0.215, d * 0.39);
        const vessel = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, h - 4, 8),
          blue,
        );
        vessel.userData.outline = "red";
        vessel.position.set(side * w * 0.25, 3 + (h - 4) / 2, 0);
        g.add(vessel);
        add(radius * 1.15, 0.25, 0.4, side * w * 0.25, h - 0.7, 0, true);
      }
    } else if (p.kind === 5 && p.layer === "skyline") {
      // Container hall and compact cargo gantry silhouette.
      add(w, h * 0.26, d, 0, h * 0.13, 0);
      for (const side of [-1, 1])
        add(1.4, h * 0.86, 1.4, side * w * 0.39, h * 0.43, 0);
      add(w, 2.3, 2.5, 0, h * 0.86, 0);
      add(w * 0.2, h * 0.09, d * 0.2, -w * 0.2, h * 0.92, 0);
      add(0.3, h * 0.38, 0.3, w * 0.25, h * 0.67, 0, true);
    } else {
      add(w, roof, d, 0, roof / 2, 0);
      if (p.kind === 1) {
        // Raised sawtooth roof lights. The roof stays legible from the
        // upper level of the course.
        for (const side of [-1, 0, 1]) {
          const monitor = add(
            w * 0.23,
            h * 0.13,
            d * 0.8,
            side * w * 0.29,
            roof + h * 0.08,
            0,
          );
          monitor.rotation.z = 0.14;
        }
      } else if (p.kind === 4) {
        // Boiler house with two square flues and a header pipe.
        for (const side of [-1, 1])
          add(
            w * 0.13,
            h * 0.22,
            d * 0.15,
            side * w * 0.25,
            roof + h * 0.11,
            -d * 0.2,
          );
        add(w * 0.65, 0.5, 0.6, 0, roof + h * 0.19, -d * 0.2, true);
      } else {
        add(w * 0.48, h * 0.18, d * 0.55, -w * 0.15, roof + h * 0.09, 0);
        if (p.layer === "district") {
          add(
            w * 0.22,
            h * 0.09,
            d * 0.23,
            w * 0.29,
            roof + h * 0.045,
            d * 0.2,
          );
          // One roof duct and two loading bays. A grid of small windows
          // would flicker at this distance.
          add(w * 0.7, 0.35, 0.55, 0, roof + 0.25, -d * 0.34, true);
        }
      }
      // Sparse facade courses, bolder on the close factories than the skyline.
      const bands = p.layer === "skyline" ? 3 : p.kind === 3 ? 4 : 2;
      for (let i = 1; i <= bands; i++) {
        const y = (roof * i) / (bands + 1);
        add(w * 0.85, 0.22, 0.1, 0, y, d / 2 + 0.08, true);
        add(0.1, 0.22, d * 0.85, w / 2 + 0.08, y, 0, true);
      }
    }
  }
  const result = batched ? bake(root) : root;
  result.name = root.name;
  result.userData.cityPlan = plan;
  return result;
}
