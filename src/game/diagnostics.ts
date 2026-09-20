import { Vector3 } from "three";
import { length, track } from "../track";
import { circuits } from "../ui";
import type { Game } from "./game";

/** Read-only state for browser verification. Nothing here drives the game:
 * the simulation is always advanced by player input. */
export function diagnostics(game: Game) {
  const { car, race, world } = game;
  return {
    state: game.state,
    audio: game.sound.diagnostics,
    screen: game.screen,
    runs: game.runs,
    inputDevice: game.inputDevice,
    cameraMode: world.cameraMode,
    theme: circuits[game.selectedCircuit].theme,
    // The course that is built, which is not always the one under the cursor.
    track: { id: track.id, name: track.name, length },
    time: race.time,
    checkpoint: race.nextCheckpoint,
    checkpointCount: track.checkpoints.length,
    sectorCount: track.checkpoints.length + 1,
    learnedLessons: [...game.learnedLessons],
    progress: car.progress,
    speed: car.speed,
    grounded: car.grounded,
    normalLoad: car.normalLoad,
    needsRespawn: car.needsRespawn,
    contactMask: car.contactMask,
    frontLoad: car.frontLoad,
    rearLoad: car.rearLoad,
    suspensionCompression: [...car.suspensionCompression],
    steering: car.steering,
    steeringAngle: car.steeringAngle,
    renderedWheels: world.car.wheelAnimation.rigs.map(
      ({ pivot, rolling, front }) => ({
        front,
        steering: pivot.rotation.y,
        spin: rolling.rotation.x,
      }),
    ),
    driftReadiness: car.driftReadiness,
    cameraPosition: world.camera.position.toArray(),
    cameraQuaternion: world.camera.quaternion.toArray(),
    cameraFov: world.camera.fov,
    carVisible: world.car.visible,
    rollRate: car.angularVelocity.dot(car.heading),
    pitchRate: car.angularVelocity.dot(car.heading.clone().cross(car.up)),
    angularVelocity: car.angularVelocity.toArray(),
    railContact: car.railContact,
    railImpact: car.railImpact,
    resetSerial: car.resetSerial,
    poseCount: race.poses.length,
    ghostPosition: world.ghost.position.toArray(),
    ghostCut: game.best?.poses[game.ghostIndex + 1]?.cut === true,
    velocity: car.velocity.toArray(),
    driftPhase: car.driftPhase,
    slipAngle: car.slipAngle,
    slipIntensity: car.slipIntensity,
    yawRate: car.yawRate,
    driftBlend: car.driftBlend,
    position: car.position.toArray(),
    heading: car.heading.toArray(),
    renderedHeading: new Vector3(0, 0, -1)
      .applyQuaternion(world.car.quaternion)
      .toArray(),
    up: car.up.toArray(),
    fps: game.frameRate,
    frameMsP95: game.frameMsP95,
    best: game.best?.time,
    boost: car.boost,
    keys: game.keyboard.codes,
    ghostVisible: world.ghost.visible,
  };
}
