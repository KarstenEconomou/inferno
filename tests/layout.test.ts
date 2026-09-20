import {
  buildLandmarks,
  buildGallery,
} from "../src/render/environment/landmarks";
import { align, box } from "../src/render/geometry";
import { OBB } from "three/addons/math/OBB.js";
import { buildTrackArchitecture } from "../src/render/environment";
import { buildCityActivity } from "../src/render/city";
import { buildSupports } from "../src/render/environment/supports";
import { assetIntersections, drivingEnvelope } from "../src/track/clearance";
import { describe, it, expect } from "vitest";
import {
  Vector3,
  Box3,
  Matrix4,
  InstancedMesh,
  Ray,
  Mesh,
  MeshBasicMaterial,
} from "three";
import {
  course,
  samples,
  length,
  roadWidth,
  track,
  frame,
  deckSegments,
} from "../src/track";
import {
  planCity,
  buildCity,
  CITY_GROUND,
  CITY_GRID,
  CityReservationIndex,
} from "../src/render/city";
const architecture = buildTrackArchitecture(() => new MeshBasicMaterial());
const cityPlan = planCity(architecture);
const cityPlots = cityPlan.plots;

describe("grade-separated figure eight and populated industrial district", () => {
  it("has a figure-eight crossing with generous vertical clearance", () => {
    const cross = (a: Vector3, b: Vector3, c: Vector3) =>
      (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const count = samples.length;
    let minimumGap = Infinity;
    const crossings: number[][] = [];
    for (let i = 0; i < count; i++)
      for (let j = i + 2; j < count; j++) {
        if (i === 0 && j === count - 1) continue;
        const a = samples[i].p,
          b = samples[(i + 1) % count].p,
          c = samples[j].p,
          d = samples[(j + 1) % count].p;
        if (
          cross(a, b, c) * cross(a, b, d) < 0 &&
          cross(c, d, a) * cross(c, d, b) < 0
        )
          crossings.push([i / count, j / count]);
        const arc = (Math.min(j - i, count - (j - i)) * length) / count;
        if (arc < 60) continue;
        const gap =
          Math.hypot(a.x - c.x, a.z - c.z) -
          (roadWidth(i / count) + roadWidth(j / count)) / 2;
        if (gap < 10)
          expect(Math.abs(a.y - c.y), `branches ${i}/${j}`).toBeGreaterThan(30);
        else minimumGap = Math.min(minimumGap, gap);
      }
    console.log("Minimum non-adjacent road clearance:", minimumGap);
    expect(crossings.length).toBeGreaterThan(0);
    expect(minimumGap).toBeGreaterThan(10);
  });
  it("has no folded deck quads or intersections between non-adjacent road edges in 3D", () => {
    const strips = deckSegments.map(({ a, b }) => {
      const f = frame(a),
        g = frame(b);
      const corners = [f, g].flatMap((s, i) =>
        [-1, 1].map((side) =>
          s.p
            .clone()
            .addScaledVector(s.right, (side * roadWidth(i ? b : a)) / 2),
        ),
      );
      // Both side edges advance along the centerline; neither folds backward.
      for (const side of [0, 1])
        expect(
          corners[side + 2].clone().sub(corners[side]).dot(f.forward),
          `fold at ${a}`,
        ).toBeGreaterThan(0);
      return { a, b, corners };
    });
    // Sweep each coarse road edge against all non-neighbor deck quads.
    // Vertical and inverted projections may overlap; actual 3D surfaces may not.
    const hit = new Vector3();
    for (let i = 0; i < samples.length; i++) {
      const a = samples[i],
        b = samples[(i + 1) % samples.length];
      if (a.gap || b.gap) continue;
      for (const side of [-1, 1]) {
        const start = a.p
          .clone()
          .addScaledVector(a.right, (side * roadWidth(a.t)) / 2);
        const end = b.p
          .clone()
          .addScaledVector(b.right, (side * roadWidth(b.t)) / 2);
        const motion = end.clone().sub(start),
          distance = motion.length();
        const ray = new Ray(start, motion.normalize());
        for (const strip of strips) {
          const arc = Math.abs(a.t - strip.a);
          if (Math.min(arc, 1 - arc) * length < 35) continue;
          if (start.distanceToSquared(strip.corners[0]) > 2500) continue;
          const [p, q, r, s] = strip.corners;
          for (const tri of [
            [p, r, q],
            [q, r, s],
          ]) {
            const intersection = ray.intersectTriangle(
              tri[0],
              tri[1],
              tri[2],
              false,
              hit,
            );
            expect(
              intersection && start.distanceTo(hit) < distance,
              `road contact ${a.t}/${strip.a}`,
            ).not.toBe(true);
          }
        }
      }
    }
  });
  it("keeps actual bridge supports outside the driving volume of both branches", () => {
    const supports = buildSupports();
    expect(supports.children.length).toBeGreaterThan(10);
    expect(assetIntersections(supports, drivingEnvelope(course))).toEqual([]);
  });
  it("keeps gates and gallery structures away from the other branch", () => {
    const environment = architecture;
    let inspected = 0;
    for (const asset of environment.children) {
      if (asset.userData.trackT === undefined) continue;
      inspected++;
      expect(
        assetIntersections(
          asset,
          drivingEnvelope(course, asset.userData.trackT),
        ),
      ).toEqual([]);
    }
    expect(inspected).toBe(
      track.boosts.length +
        track.gaps.length * 2 +
        track.checkpoints.length +
        1 +
        (track.gallery?.count ?? 0),
    );
  });
  it("detects real lane intrusions while distinguishing under-deck clamps on banks and ceilings", () => {
    const envelope = drivingEnvelope(course);
    for (const kind of ["wallride", "helix", "inverted"] as const) {
      const feature = track.features!.find((f) => f.kind === kind)!;
      const t = (feature.start + feature.end) / 2,
        f = frame(t);
      const obstacle = box(2, 2, 2, new MeshBasicMaterial());
      obstacle.position.copy(f.p).addScaledVector(f.up, 1.5);
      align(obstacle, f);
      expect(
        assetIntersections(obstacle, envelope).length,
        kind,
      ).toBeGreaterThan(0);
      obstacle.position.copy(f.p).addScaledVector(f.up, -2.1);
      expect(assetIntersections(obstacle, envelope), kind).toEqual([]);
    }
  });
  it("keeps new architectural landmarks clear of the complete driving envelope", () => {
    const landmarks = buildLandmarks();
    expect(landmarks.children.length).toBe(
      (track.landmarks ?? []).reduce((sum, x) => sum + x.count, 0),
    );
    expect(assetIntersections(landmarks, drivingEnvelope(course))).toEqual([]);
  });
  it("connects every overhead component to a clamp that intersects the actual deck slab", () => {
    const assemblies = [
      ...buildLandmarks().children,
      ...buildGallery().children,
    ];
    let mounts = 0;
    for (const group of assemblies) {
      group.updateMatrixWorld(true);
      const half = roadWidth(group.userData.trackT) / 2;
      const slab = new Box3(
        new Vector3(-half, -1.4, -3),
        new Vector3(half, 0, 3),
      );
      const parts = group.children.map((object) => {
        const mesh = object as Mesh;
        mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry
          .boundingBox!.clone()
          .applyMatrix4(mesh.matrix);
        const obb = new OBB()
          .fromBox3(mesh.geometry.boundingBox!)
          .applyMatrix4(mesh.matrix);
        obb.halfSize.addScalar(0.025);
        const clamp = mesh.userData.deckClamp !== undefined;
        if (clamp) {
          mounts++;
          expect(bounds.intersectsBox(slab), mesh.name).toBe(true);
        }
        return { obb, clamp, name: mesh.name };
      });
      const connected = new Set(parts.filter((p) => p.clamp));
      expect(connected.size, group.name).toBeGreaterThan(0);
      let grew = true;
      while (grew) {
        grew = false;
        for (const p of parts)
          if (
            !connected.has(p) &&
            [...connected].some((q) => p.obb.intersectsOBB(q.obb))
          ) {
            connected.add(p);
            grew = true;
          }
      }
      expect(
        parts.filter((p) => !connected.has(p)).map((p) => p.name),
        `floating components in ${group.name}`,
      ).toEqual([]);
    }
    expect(mounts).toBeGreaterThan(40);
  });
  it("populates every ground parcel, including the area directly below the track", () => {
    expect(cityPlan.parcels.length).toBeGreaterThan(2500);
    expect(cityPlots.length).toBeGreaterThan(3000);
    const empty = cityPlan.parcels.filter((p) => p.built === 0);
    expect(empty.every((p) => p.reserved > 0)).toBe(true);
    expect(empty.length).toBeLessThan(cityPlan.parcels.length * 0.005);
    // Inspect below every course station, not only the city-wide average.
    let underneath = 0;
    let largestDistance = 0;
    for (const s of samples) {
      const nearby = cityPlots.filter(
        (p) =>
          p.layer === "district" &&
          Math.abs(p.x - s.p.x) < CITY_GRID * 1.5 &&
          Math.abs(p.z - s.p.z) < CITY_GRID * 1.5,
      );
      const nearest = Math.min(
        ...nearby.map((p) => Math.hypot(p.x - s.p.x, p.z - s.p.z)),
      );
      largestDistance = Math.max(largestDistance, nearest);
      expect(nearest).toBeLessThan(CITY_GRID);
      const below = nearby.filter((p) =>
        p.bounds.containsPoint(new Vector3(s.p.x, CITY_GROUND + 1, s.p.z)),
      );
      if (below.length) underneath++;
      for (const p of below) {
        expect(p.height).toBeLessThanOrEqual(52);
        expect(p.bounds.max.y).toBeLessThan(s.p.y - 8);
      }
    }
    console.log("City coverage", {
      plots: cityPlots.length,
      parcels: cityPlan.parcels.length,
      empty: empty.length,
      underneath,
      stations: samples.length,
      largestDistance,
    });
    expect(underneath / samples.length).toBeGreaterThan(0.55);
    // Four shallow skyline rows span all quadrants beyond the populated ground.
    const skyline = cityPlots.filter((p) => p.layer === "skyline");
    expect(skyline.length).toBeGreaterThan(600);
    for (const axis of ["x", "z"] as const)
      for (const side of [-1, 1])
        expect(
          skyline.filter((p) =>
            side < 0
              ? p[axis] < cityPlan.bounds.min[axis]
              : p[axis] > cityPlan.bounds.max[axis],
          ).length,
        ).toBeGreaterThan(100);
  });
  it("has no city-to-city overlap or overlap with any race asset, camera corridor or jump", () => {
    const reservations = new CityReservationIndex(cityPlan.reservations);
    const occupied = new CityReservationIndex(cityPlots.map((p) => p.bounds));
    for (const p of cityPlots) {
      expect(
        reservations.query(p.bounds).filter((b) => b.intersectsBox(p.bounds)),
        `race asset at parcel ${p.id}`,
      ).toEqual([]);
      expect(
        occupied
          .query(p.bounds)
          .filter((b) => b !== p.bounds && b.intersectsBox(p.bounds)),
        `neighbor at parcel ${p.id}`,
      ).toEqual([]);
    }
  });
  it("contains service traffic in its reserved building aprons through a full cycle", () => {
    const activity = buildCityActivity(cityPlan);
    const matrix = new Matrix4(),
      vertex = new Vector3();
    const mesh = activity.root.children[0] as InstancedMesh;
    const positions = mesh.geometry.attributes.position;
    for (let time = 0; time <= 60; time += 2) {
      activity.update(time);
      for (let i = 0; i < mesh.count; i++) {
        const plot = activity.plots[i];
        mesh.getMatrixAt(i, matrix);
        const actual = new Box3();
        for (let v = 0; v < positions.count; v++)
          actual.expandByPoint(
            vertex.fromBufferAttribute(positions, v).applyMatrix4(matrix),
          );
        expect(plot.bounds.containsBox(actual), `truck ${i}`).toBe(true);
        // Trucks stay outside the facade itself, even for rotated buildings.
        expect(actual.min.z).toBeGreaterThan(plot.z + (plot.depth - 4) / 2);
      }
    }
  });
  it("keeps actual buildings, crane booms and details within their declared footprints", () => {
    const city = buildCity(cityPlan, false);
    city.updateMatrixWorld(true);
    const vertex = new Vector3();
    for (const group of city.children) {
      const plot = group.userData.cityPlot;
      const bounds = new Box3();
      group.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const positions = object.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          vertex
            .fromBufferAttribute(positions, i)
            .applyMatrix4(object.matrixWorld);
          bounds.expandByPoint(vertex);
        }
      });
      expect(
        plot.bounds.clone().expandByScalar(0.001).containsBox(bounds),
        `building ${plot.id} kind ${plot.kind}: ${JSON.stringify(bounds)}`,
      ).toBe(true);
    }
  });
});
