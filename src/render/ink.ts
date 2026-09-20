import * as THREE from "three";
import { circuits, type TrackTheme } from "../circuits";

/** The three printing inks of the selected circuit. The values are authored
 * in display space, so the final pass must not apply tone mapping to them.
 *
 * A circuit change repaints the inks in place. Every material built here is
 * remembered, so the scene keeps its materials and only their colours move. */
export const PALETTE = {
  blue: circuits[0].theme.field,
  green: circuits[0].theme.signal,
  red: circuits[0].theme.structure,
};
export type Ink = keyof typeof PALETTE;
export const inkColor = (ink: Ink) =>
  new THREE.Color(PALETTE[ink]).convertLinearToSRGB();

type Painted = { ink: Ink; repaint: () => void };
const painted: Painted[] = [];
const remember = <T extends THREE.Material>(
  material: T,
  ink: Ink,
  repaint: () => void,
) => {
  painted.push({ ink, repaint });
  return material;
};
/** Repaint every ink material for a circuit. Call it before the scene for
 * that circuit is built, so nothing is drawn in the colours of another. */
export function setInk(theme: TrackTheme) {
  PALETTE.blue = theme.field;
  PALETTE.green = theme.signal;
  PALETTE.red = theme.structure;
  for (const material of painted) material.repaint();
}

export function solid(ink: Ink) {
  const material = new THREE.MeshBasicMaterial({
    color: inkColor(ink),
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  return remember(material, ink, () => material.color.copy(inkColor(ink)));
}
export function lineInk(ink: Ink) {
  const material = new THREE.LineBasicMaterial({
    color: inkColor(ink),
    toneMapped: false,
  });
  return remember(material, ink, () => material.color.copy(inkColor(ink)));
}

/** A surface of two inks with a hard boundary. There is no texture mask, no
 * dither pattern and no animated light. */
export function printed(
  ink: Ink,
  surface: "metal" | "road" | "car" | "concrete" | "desert" = "metal",
) {
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    uniforms: {
      pigment: { value: inkColor(ink) },
      paper: { value: inkColor("blue") },
      mode: {
        value: { metal: 0, road: 1, car: 2, concrete: 3, desert: 4 }[surface],
      },
    },
    vertexShader: `
      varying vec3 worldNormal;
      varying vec3 objectPosition;
      varying vec3 objectNormal;
      void main() {
        objectPosition = position;
        objectNormal = normal;
        worldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      precision highp float;
      uniform vec3 pigment;
      uniform vec3 paper;
      uniform int mode;
      varying vec3 worldNormal;
      varying vec3 objectPosition;
      varying vec3 objectNormal;
      void main() {
        float mark;
        if (mode == 1) mark=0.0;
        else if (mode == 2) {
          // The upper body is lime and the vertical and lower planes are
          // cobalt. A sharp shoulder joins the top to the flanks. The
          // boundary does not move with the light, so it cannot flicker.
          vec3 n=normalize(objectNormal);
          float top=.12+.28*clamp((objectPosition.z+2.2)/4.15,0.0,1.0);
          mark=n.y>.3 || (n.y>-.3 && top-objectPosition.y<.045) ? 1.0 : 0.0;
        } else {
          // Open ground is lit earth almost everywhere: only a slope that
          // genuinely turns away from the sun falls into the dark field.
          float light=dot(normalize(worldNormal),normalize(vec3(-.6,.85,-.35)));
          mark=light>(mode==4 ? -.30 : mode==3 ? .08 : .5) ? 1.0 : 0.0;
        }
        gl_FragColor=vec4(mix(paper,pigment,mark),1.0);
      }`,
  });
  return remember(material, ink, () => {
    material.uniforms.pigment.value = inkColor(ink);
    material.uniforms.paper.value = inkColor("blue");
  });
}
