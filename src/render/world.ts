import { CameraController, type CameraPreset } from "./camera";
import * as THREE from "three";
import { TireTrails } from "./trails";
import { interpolatePose, type Vehicle, type Pose } from "../sim";
import { inkColor, setInk } from "./ink";
import { makeCar } from "./car";
import { buildCityActivity } from "./city";
import { buildEnvironment } from "./environment";
import { selectCourse } from "../track";
import type { CircuitIdentity } from "../circuits";
export { makeCar } from "./car";

/** The rendered world: the scene, the camera, the car, the ghost and the
 * two-stage print pass. The scene renders into a low resolution target, and a
 * full-screen pass then maps each pixel to the nearest of the three inks. */
/** Release the geometry of a subtree. Materials are shared and repainted
 * rather than replaced, so they stay. */
function dispose(root: THREE.Object3D) {
  root.traverse((object) => {
    const geometry = (object as THREE.Mesh).geometry;
    if (geometry) geometry.dispose();
  });
}

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  cameraController!: CameraController;
  get cameraMode(): CameraPreset {
    return this.cameraController.preset;
  }
  set cameraMode(mode: number) {
    this.cameraController.preset = mode as CameraPreset;
    this.cameraController.reset();
  }
  get camReady() {
    return this.cameraController.ready;
  }
  set camReady(ready: boolean) {
    this.cameraController.ready = ready;
  }
  updateCamera(car: Parameters<CameraController["update"]>[0], dt: number) {
    this.cameraController.update(car, dt);
  }
  resetCamera(car: Parameters<CameraController["update"]>[0]) {
    this.cameraController.reset();
    this.cameraController.update(car, 0);
    this.cameraController.apply(this.camera);
    this.setPose(this.car, car.position, car.heading, car.up);
    this.car.visible = this.cameraMode !== 2;
  }
  camera = new THREE.PerspectiveCamera(70, 1, 0.5, 2200);
  cityActivity!: ReturnType<typeof buildCityActivity>;
  car!: ReturnType<typeof makeCar>;
  ghost!: ReturnType<typeof makeCar>;
  private scenery: THREE.Object3D | null = null;
  target = new THREE.WebGLRenderTarget(640, 360, {
    samples: 4,
    resolveDepthBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  postScene = new THREE.Scene();
  postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  trails!: TireTrails;
  private postMaterial!: THREE.ShaderMaterial;
  lastFrameStats = { calls: 0, triangles: 0 };
  private wheelResetSerial = -1;
  private ghostCut: Pose | null = null;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    // Resolve the coverage of an edge inside a pixel first, then select the
    // nearest of the three inks. There is no blur and no fourth colour: very
    // small geometry loses coverage instead of flashing at full strength.
    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.target.texture },
        field: { value: inkColor("blue") },
        structure: { value: inkColor("red") },
        signal: { value: inkColor("green") },
      },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader: `
        precision highp float;
        uniform sampler2D map;
        uniform vec3 field, structure, signal;
        varying vec2 vUv;
        void main() {
          vec3 c = texture2D(map, vUv).rgb;
          float a = dot(c-field,c-field);
          float b = dot(c-structure,c-structure);
          float d = dot(c-signal,c-signal);
          gl_FragColor = vec4(a <= b && a <= d ? field : b <= d ? structure : signal, 1.0);
        }`,
    });
    this.postMaterial = material;
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    this.build();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /** Select a circuit: repaint the inks, compile its course and build the
   * world around it. Nothing calls this while a car is moving. */
  loadCircuit(circuit: CircuitIdentity) {
    setInk(circuit.theme);
    selectCourse(circuit.id);
    this.build();
  }

  /** Build the scene for the course that is selected now. The car, the ghost
   * and the tire marks are rebuilt with it, so nothing keeps geometry or a
   * colour that belonged to another circuit. */
  private build() {
    for (const object of [
      this.scenery,
      this.cityActivity?.root,
      this.car,
      this.ghost,
      this.trails?.mesh,
    ])
      if (object) {
        this.scene.remove(object);
        dispose(object);
      }
    this.renderer.setClearColor(inkColor("blue"));
    this.scene.background = inkColor("blue");
    for (const [name, ink] of [
      ["field", "blue"],
      ["structure", "red"],
      ["signal", "green"],
    ] as const)
      this.postMaterial.uniforms[name].value = inkColor(ink);
    const environment = buildEnvironment();
    this.scenery = environment;
    const obstructions = environment.userData.cameraObstructions.sweep;
    if (this.cameraController)
      this.cameraController.obstructions = obstructions;
    else this.cameraController = new CameraController(obstructions);
    this.cityActivity = buildCityActivity(environment.userData.cityPlan);
    this.car = makeCar();
    this.ghost = makeCar(true);
    this.trails = new TireTrails();
    this.scene.add(
      environment,
      this.cityActivity.root,
      this.car,
      this.ghost,
      this.trails.mesh,
    );
    this.ghost.visible = false;
  }
  resize() {
    const w = innerWidth,
      h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const logicalHeight = Math.min(900, h);
    this.target.setSize(Math.round((logicalHeight * w) / h), logicalHeight);
  }
  setPose(
    object: THREE.Object3D,
    p: THREE.Vector3,
    h: THREE.Vector3,
    u: THREE.Vector3,
  ) {
    object.position.copy(p);
    const right = new THREE.Vector3().crossVectors(h, u).normalize();
    const upright = new THREE.Vector3().crossVectors(right, h).normalize();
    object.quaternion
      .setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(
          right,
          upright,
          h.clone().normalize().negate(),
        ),
      )
      .normalize();
  }
  showGhost(a: Pose, b: Pose, alpha: number) {
    const pose = interpolatePose(a, b, alpha);
    if (pose.cut && pose !== this.ghostCut) {
      this.ghost.wheelAnimation.reset();
      this.ghostCut = pose;
    }
    this.setPose(
      this.ghost,
      new THREE.Vector3().fromArray(pose.p),
      new THREE.Vector3().fromArray(pose.h),
      new THREE.Vector3().fromArray(pose.u),
    );
    this.ghost.wheelAnimation.update(
      this.ghost.position,
      new THREE.Vector3().fromArray(pose.h),
      pose.steeringAngle,
    );
  }

  render(
    car: Pick<Vehicle, "position" | "heading" | "up" | "speed" | "boost"> & {
      grounded?: boolean;
      suspension?: number;
      velocity?: THREE.Vector3;
      slipIntensity?: number;
      slipAngle?: number;
      steeringAngle?: number;
      resetSerial?: number;
    },
    dt: number,
    title = false,
    time = 0,
    alpha = 1,
  ) {
    this.cityActivity.update(time);
    // Game already interpolates position and orientation together between
    // physics steps. Delaying only the body rotation makes a short turn look
    // like sideways translation before the nose catches up.
    this.setPose(this.car, car.position, car.heading, car.up);
    if (
      car.resetSerial !== undefined &&
      car.resetSerial !== this.wheelResetSerial
    ) {
      this.car.wheelAnimation.reset();
      this.wheelResetSerial = car.resetSerial;
    }
    this.car.wheelAnimation.update(
      car.position,
      car.heading,
      car.steeringAngle,
    );
    const compression = car.suspension ?? 0;
    const body = this.car.getObjectByName("suspension-body")!;
    body.position.y = -compression * 0.18;
    body.rotation.x = compression * 0.025;
    body.rotation.z = THREE.MathUtils.clamp(
      (car.slipAngle ?? 0) * 0.08,
      -0.045,
      0.045,
    );
    this.car.visible = this.cameraMode !== 2;
    if (!this.camReady) this.updateCamera(car, 0);
    this.cameraController.apply(this.camera, alpha);
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.lastFrameStats = {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }
}
