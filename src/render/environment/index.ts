import * as THREE from "three";
import { lane, length, track } from "../../track";
import { bake } from "../geometry";
import { CameraObstructions } from "../obstructions";
import { buildCity, planCity } from "../city";
import { buildDesert, buildRimFence } from "../desert";
import { buildGallery, buildLandmarks } from "./landmarks";
import {
  buildBoostPads,
  buildGapMarkings,
  buildGates,
  buildMarkerPosts,
  type SignFactory,
} from "./markings";
import { fascia, paint, ribbon } from "./surfaces";
import { sign } from "./signs";
import { buildSupports } from "./supports";
export { sign } from "./signs";

/** The elevated deck of the works. Lime belongs to the continuous racing
 * edge; narrow red shoulders keep the industrial deck treatment without
 * merging into the red city contours. */
function buildWorksDeck(root: THREE.Group) {
  root.add(
    ribbon(0, track.width, 0, paint.asphalt),
    ribbon(0, track.width, -1.4, paint.blue),
  );
  for (const side of [-1, 1]) {
    root.add(fascia(side, -1.4, 0, paint.blue));
    root.add(fascia(side, -0.8, -0.5, paint.red));
    root.add(ribbon(side * (track.width / 2 - 0.375), 0.75, 0.026, paint.red));
    root.add(ribbon(side * (track.width / 2 - 0.95), 0.4, 0.055, paint.green));
    root.add(fascia(side, 0.15, 1.15, paint.blue, 0.45));
    root.add(ribbon(side * (track.width / 2 + 0.45), 0.32, 1.15, paint.green));
    root.add(ribbon(side * (track.width / 2 + 0.45), 0.16, 0.16, paint.red));
  }
  root.add(ribbon(0, 0.12, 0.045, paint.red));
}

/** A graded desert corridor with a road painted through it.
 *
 * The whole corridor is one surface and the whole corridor is driveable. The
 * asphalt is a band laid on it in real metres, wandering where the surveyor
 * put it, and the yellow lines belong to that band rather than to the edge of
 * the course. Where the two part company is where the circuit is won. */
function buildDesertDeck(root: THREE.Group) {
  const centre = (t: number) => lane(t).offset;
  const paved = (t: number) => lane(t).halfWidth * 2;
  const unscaled = { scaled: false };
  root.add(ribbon(0, track.width, 0, paint.concrete));
  root.add(ribbon(centre, paved, 0.03, paint.asphalt, unscaled));
  // Oxide lines belong to the asphalt: its two edges and a broken middle.
  // They say where the road is, and nothing more.
  for (const side of [-1, 1])
    root.add(
      ribbon(
        (t) => lane(t).offset + side * (lane(t).halfWidth - 0.4),
        0.42,
        0.062,
        paint.red,
        unscaled,
      ),
    );
  root.add(
    ribbon(centre, 0.32, 0.058, paint.red, {
      scaled: false,
      skip: (t) => Math.floor((t * length) / 13) % 2 === 1,
    }),
  );
  // Solar yellow belongs to the one line that cannot be crossed: the edge of
  // the graded corridor, which is where the course stops.
  // The skirt of the corridor runs deeper than the graded bench under it, so
  // the concrete always meets the desert and never floats over it.
  for (const side of [-1, 1]) {
    root.add(fascia(side, -2.1, 0, paint.concrete));
    root.add(ribbon(side * (track.width / 2 - 0.38), 0.76, 0.02, paint.green));
  }
}

/** Every static part of the race course, before the renderer batches it.
 * The sign factory is a parameter, so tests can build the course without a
 * canvas. */
export function buildTrackArchitecture(makeSign: SignFactory = sign) {
  const root = new THREE.Group();
  const desert = track.scenery === "desert";
  if (desert) {
    buildDesertDeck(root);
    buildRimFence(root);
  } else {
    buildWorksDeck(root);
    buildMarkerPosts(root);
  }
  buildBoostPads(root);
  buildGapMarkings(root);
  buildGates(root, makeSign);
  if (!desert) {
    root.add(buildLandmarks());
    root.add(buildSupports());
    root.add(...buildGallery().children);
  }
  return root;
}

/** The complete world. The race architecture exists in full before any city
 * parcel is planned or any landmark is placed, so nothing built around the
 * course can occupy it or its approaches. */
export function buildEnvironment(batched = true, makeSign: SignFactory = sign) {
  const architecture = buildTrackArchitecture(makeSign);
  const cameraObstructions = new CameraObstructions(architecture);
  if (track.scenery === "desert") {
    const desert = buildDesert();
    const result = batched ? bake(architecture) : architecture;
    result.add(batched ? bake(desert) : desert);
    result.userData.cityPlan = null;
    result.userData.cameraObstructions = cameraObstructions;
    return result;
  }
  const cityPlan = planCity(architecture);
  const result = batched ? bake(architecture) : architecture;
  result.add(buildCity(cityPlan, batched));
  result.userData.cityPlan = cityPlan;
  result.userData.cameraObstructions = cameraObstructions;
  return result;
}
