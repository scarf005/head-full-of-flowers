import { clamp, lerp, limitToArena, randomRange } from "../utils.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"

export interface UpdatePlayerDeps {
  firePrimary: () => void
  startReload: () => void
  throwSecondary: () => void
  collectNearbyPickup: () => void
  updateCrosshairWorld: () => void
}

export const updateCrosshairWorld = (world: WorldState) => {
  world.input.worldX = world.camera.x + (world.input.canvasX - VIEW_WIDTH * 0.5) / WORLD_SCALE
  world.input.worldY = world.camera.y + (world.input.canvasY - VIEW_HEIGHT * 0.5) / WORLD_SCALE
}

export const updateCombatFeel = (world: WorldState, dt: number) => {
  for (const unit of world.units) {
    unit.hitFlash = Math.max(0, unit.hitFlash - dt * 6.5)
    unit.recoil = Math.max(0, unit.recoil - dt * 8.5)
  }

  world.cameraShake = Math.max(0, world.cameraShake - dt * 3.8)
  const shakePower = Math.pow(clamp(world.cameraShake, 0, 1.5), 1.15)
  world.cameraOffset.x = randomRange(-1, 1) * shakePower * 0.46
  world.cameraOffset.y = randomRange(-1, 1) * shakePower * 0.36
}

export const updatePlayer = (world: WorldState, dt: number, deps: UpdatePlayerDeps) => {
  const player = world.player
  player.shootCooldown = Math.max(0, player.shootCooldown - dt)
  player.secondaryCooldown = Math.max(0, player.secondaryCooldown - dt)
  if (player.secondaryCooldown <= 0) {
    player.secondaryCooldownMax = 0
  }
  player.reloadCooldown = Math.max(0, player.reloadCooldown - dt)

  let moveX = 0
  let moveY = 0

  if (world.input.keys.has("w")) {
    moveY -= 1
  }
  if (world.input.keys.has("s")) {
    moveY += 1
  }
  if (world.input.keys.has("a")) {
    moveX -= 1
  }
  if (world.input.keys.has("d")) {
    moveX += 1
  }

  const moveLength = Math.hypot(moveX, moveY)
  const targetSpeed = player.speed
  const targetVelocityX = moveLength > 0 ? (moveX / moveLength) * targetSpeed : 0
  const targetVelocityY = moveLength > 0 ? (moveY / moveLength) * targetSpeed : 0
  const accel = moveLength > 0 ? 24 : 18
  player.velocity.x = lerp(player.velocity.x, targetVelocityX, clamp(dt * accel, 0, 1))
  player.velocity.y = lerp(player.velocity.y, targetVelocityY, clamp(dt * accel, 0, 1))

  player.position.x += player.velocity.x * dt
  player.position.y += player.velocity.y * dt
  limitToArena(player.position, player.radius, world.arenaRadius)

  deps.updateCrosshairWorld()
  const aimX = world.input.worldX - player.position.x
  const aimY = world.input.worldY - player.position.y
  const aimLength = Math.hypot(aimX, aimY) || 1
  player.aim.x = aimX / aimLength
  player.aim.y = aimY / aimLength

  if (world.input.leftDown) {
    deps.firePrimary()
  }

  if (world.input.keys.has("r")) {
    deps.startReload()
  }

  if (world.input.rightDown) {
    deps.throwSecondary()
  }

  deps.collectNearbyPickup()
}
