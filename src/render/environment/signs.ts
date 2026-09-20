import * as THREE from "three";
import { PALETTE } from "../ink";

export function sign(
  text: string,
  foreground = PALETTE.green,
  background = PALETTE.blue,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = background;
  context.fillRect(0, 0, 1024, 128);
  context.fillStyle = foreground;
  context.font = "italic 900 91px Arial";
  context.textAlign = "center";
  context.fillText(text, 512, 96, 990);
  // Reduce the antialiased glyph edges to two inks before the texture goes
  // to the graphics card.
  const image = context.getImageData(0, 0, 1024, 128);
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const fg = rgb(foreground),
    bg = rgb(background);
  for (let i = 0; i < image.data.length; i += 4) {
    let a = 0,
      b = 0;
    for (let c = 0; c < 3; c++) {
      a += (image.data[i + c] - fg[c]) ** 2;
      b += (image.data[i + c] - bg[c]) ** 2;
    }
    for (let c = 0; c < 3; c++) image.data[i + c] = (a < b ? fg : bg)[c];
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
