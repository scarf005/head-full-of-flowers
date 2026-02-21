import { type CullBounds, isInsideCullBounds } from "../cull.ts"
import { clamp, randomRange } from "../utils.ts"
import type { WorldState } from "../world/state.ts"
const BULLET_TRAIL_WIDTH_SCALE = 4
const SECONDARY_TRAIL_WIDTH_SCALE = 6
const BULLET_TRAIL_COLOR = "#ff9e3a"
const ROCKET_TRAIL_LENGTH_MULTIPLIER = 4
const ROCKET_SMOKE_SIZE_SCALE = 0.75

const isInsideFogCullBounds = (x: number, y: number, bounds: CullBounds, padding = 0) => {
  return isInsideCullBounds(x, y, bounds, padding)
}

const emitFlightTrailSegment = (
  world: WorldState,
  x: number,
  y: number,
  directionX: number,
  directionY: number,
  length: number,
  width: number,
  color: string,
  alpha: number,
  life: number,
  style = 0,
  driftSpeed = 0,
  driftDrag = 0,
  growth = 0,
  turbulence = 0,
) => {
  const magnitude = Math.hypot(directionX, directionY)
  if (magnitude <= 0.00001 || life <= 0.001 || alpha <= 0.001) {
    return
  }

  const slot = world.flightTrails[world.flightTrailCursor]
  world.flightTrailCursor = (world.flightTrailCursor + 1) % world.flightTrails.length
  slot.active = true
  slot.position.set(x, y)
  slot.direction.set(directionX / magnitude, directionY / magnitude)
  slot.length = Math.max(0.02, length)
  slot.width = Math.max(0.01, width)
  slot.color = color
  slot.alpha = clamp(alpha, 0, 1)
  slot.maxLife = life
  slot.life = life
  slot.style = style
  slot.driftSpeed = driftSpeed
  slot.driftDrag = driftDrag
  slot.growth = growth
  slot.turbulence = turbulence
}

export const emitProjectileTrail = (
  world: WorldState,
  projectile: WorldState["projectiles"][number],
  fogCullBounds: CullBounds,
) => {
  if (!projectile.active) {
    return
  }

  if (
    !isInsideFogCullBounds(
      projectile.position.x,
      projectile.position.y,
      fogCullBounds,
      projectile.radius * 3.2 + 0.9,
    )
  ) {
    projectile.trailX = projectile.position.x
    projectile.trailY = projectile.position.y
    projectile.trailReady = false
    return
  }

  const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
  if (!projectile.trailReady) {
    projectile.trailX = projectile.position.x
    projectile.trailY = projectile.position.y
    const length = speed || 1
    projectile.trailDirX = projectile.velocity.x / length
    projectile.trailDirY = projectile.velocity.y / length
    projectile.trailReady = true
    return
  }

  const deltaX = projectile.position.x - projectile.trailX
  const deltaY = projectile.position.y - projectile.trailY
  const distance = Math.hypot(deltaX, deltaY)
  if (distance <= 0.001) {
    return
  }

  if (speed <= 0.08) {
    projectile.trailX = projectile.position.x
    projectile.trailY = projectile.position.y
    return
  }

  const spacing = projectile.kind === "flame" ? 0.1 : projectile.kind === "rocket" ? 0.09 : 0.08
  const sampleCount = Math.max(1, Math.ceil(distance / spacing))
  const speedFactor = clamp(speed / (projectile.kind === "flame" ? 24 : projectile.kind === "rocket" ? 18 : 44), 0, 2)
  let previousX = projectile.trailX
  let previousY = projectile.trailY
  let smoothDirX = projectile.trailDirX
  let smoothDirY = projectile.trailDirY
  const smoothing = projectile.kind === "flame" ? 0.34 : 0.28

  for (let index = 1; index <= sampleCount; index += 1) {
    const t = index / sampleCount
    const sampleX = projectile.trailX + deltaX * t
    const sampleY = projectile.trailY + deltaY * t

    const stepX = sampleX - previousX
    const stepY = sampleY - previousY
    const stepLength = Math.hypot(stepX, stepY)
    if (stepLength > 0.0001) {
      const targetDirX = stepX / stepLength
      const targetDirY = stepY / stepLength
      smoothDirX += (targetDirX - smoothDirX) * smoothing
      smoothDirY += (targetDirY - smoothDirY) * smoothing
      const smoothLength = Math.hypot(smoothDirX, smoothDirY) || 1
      smoothDirX /= smoothLength
      smoothDirY /= smoothLength
    }

    if (projectile.kind === "flame") {
      emitFlightTrailSegment(
        world,
        sampleX,
        sampleY,
        smoothDirX,
        smoothDirY,
        0.2 + speedFactor * 0.18,
        (0.085 + speedFactor * 0.024) * BULLET_TRAIL_WIDTH_SCALE,
        "#ffd8af",
        0.4,
        0.11 + speedFactor * 0.05,
      )
    } else if (projectile.kind === "rocket") {
      const reverseBaseX = speed > 0.0001 ? -projectile.velocity.x / speed : -smoothDirX
      const reverseBaseY = speed > 0.0001 ? -projectile.velocity.y / speed : -smoothDirY
      const reverseNormalX = -reverseBaseY
      const reverseNormalY = reverseBaseX
      const puffs = 4
      for (let puffIndex = 0; puffIndex < puffs; puffIndex += 1) {
        const lateral = randomRange(-1, 1) * (0.08 + speedFactor * 0.03)
        const back = randomRange(0.1, 0.44) * ROCKET_TRAIL_LENGTH_MULTIPLIER
        const smokeX = sampleX + reverseBaseX * back + reverseNormalX * lateral
        const smokeY = sampleY + reverseBaseY * back + reverseNormalY * lateral
        const spread = 0.24 + speedFactor * 0.08
        const flyDirX = reverseBaseX + reverseNormalX * randomRange(-spread, spread)
        const flyDirY = reverseBaseY + reverseNormalY * randomRange(-spread, spread)
        const flyLen = Math.hypot(flyDirX, flyDirY) || 1
        const driftSpeed = randomRange(0.62, 2.1) + speedFactor * 0.95
        const core = Math.random() > 0.45

        emitFlightTrailSegment(
          world,
          smokeX,
          smokeY,
          flyDirX / flyLen,
          flyDirY / flyLen,
          (0.12 + speedFactor * (core ? 0.05 : 0.04)) * ROCKET_TRAIL_LENGTH_MULTIPLIER,
          (0.12 + speedFactor * (core ? 0.04 : 0.03)) * BULLET_TRAIL_WIDTH_SCALE * ROCKET_SMOKE_SIZE_SCALE,
          core ? "#30363d" : "#1f252b",
          core ? 0.78 : 0.66,
          0.24 + speedFactor * randomRange(0.08, 0.16),
          1,
          driftSpeed,
          randomRange(0.55, 1.15),
          randomRange(0.65, 1.35),
          randomRange(1.8, 4.4),
        )
      }
    } else {
      emitFlightTrailSegment(
        world,
        sampleX,
        sampleY,
        smoothDirX,
        smoothDirY,
        0.34 + speedFactor * 0.22,
        (0.028 + speedFactor * 0.01) * BULLET_TRAIL_WIDTH_SCALE,
        BULLET_TRAIL_COLOR,
        0.9,
        0.14 + speedFactor * 0.08,
      )
    }

    previousX = sampleX
    previousY = sampleY
  }

  projectile.trailX = projectile.position.x
  projectile.trailY = projectile.position.y
  projectile.trailDirX = smoothDirX
  projectile.trailDirY = smoothDirY
}

export const emitThrowableTrail = (
  world: WorldState,
  throwable: WorldState["throwables"][number],
  fogCullBounds: CullBounds,
) => {
  if (!throwable.active) {
    return
  }

  if (!isInsideFogCullBounds(throwable.position.x, throwable.position.y, fogCullBounds, throwable.radius + 1.1)) {
    throwable.trailX = throwable.position.x
    throwable.trailY = throwable.position.y
    throwable.trailReady = false
    return
  }

  const speed = Math.hypot(throwable.velocity.x, throwable.velocity.y)
  if (!throwable.trailReady) {
    throwable.trailX = throwable.position.x
    throwable.trailY = throwable.position.y
    const length = speed || 1
    throwable.trailDirX = throwable.velocity.x / length
    throwable.trailDirY = throwable.velocity.y / length
    throwable.trailReady = true
    return
  }

  const deltaX = throwable.position.x - throwable.trailX
  const deltaY = throwable.position.y - throwable.trailY
  const distance = Math.hypot(deltaX, deltaY)
  if (distance <= 0.001) {
    return
  }

  if (speed <= 0.18) {
    throwable.trailX = throwable.position.x
    throwable.trailY = throwable.position.y
    return
  }

  const spacing = throwable.mode === "grenade" ? 0.09 : 0.12
  const sampleCount = Math.max(1, Math.ceil(distance / spacing))
  const speedFactor = clamp(speed / 20, 0, 1.5)
  let previousX = throwable.trailX
  let previousY = throwable.trailY
  let smoothDirX = throwable.trailDirX
  let smoothDirY = throwable.trailDirY
  const smoothing = throwable.mode === "grenade" ? 0.3 : 0.36

  for (let index = 1; index <= sampleCount; index += 1) {
    const t = index / sampleCount
    const sampleX = throwable.trailX + deltaX * t
    const sampleY = throwable.trailY + deltaY * t

    const stepX = sampleX - previousX
    const stepY = sampleY - previousY
    const stepLength = Math.hypot(stepX, stepY)
    if (stepLength > 0.0001) {
      const targetDirX = stepX / stepLength
      const targetDirY = stepY / stepLength
      smoothDirX += (targetDirX - smoothDirX) * smoothing
      smoothDirY += (targetDirY - smoothDirY) * smoothing
      const smoothLength = Math.hypot(smoothDirX, smoothDirY) || 1
      smoothDirX /= smoothLength
      smoothDirY /= smoothLength
    }

    if (throwable.mode === "grenade") {
      emitFlightTrailSegment(
        world,
        sampleX,
        sampleY,
        smoothDirX,
        smoothDirY,
        0.22 + speedFactor * 0.2,
        (0.058 + speedFactor * 0.024) * SECONDARY_TRAIL_WIDTH_SCALE,
        "#f7faee",
        0.54,
        0.16 + speedFactor * 0.07,
      )
    } else {
      emitFlightTrailSegment(
        world,
        sampleX,
        sampleY,
        smoothDirX,
        smoothDirY,
        0.18 + speedFactor * 0.15,
        (0.066 + speedFactor * 0.018) * SECONDARY_TRAIL_WIDTH_SCALE,
        "#ffd2a2",
        0.42,
        0.13 + speedFactor * 0.05,
      )
    }

    previousX = sampleX
    previousY = sampleY
  }

  throwable.trailX = throwable.position.x
  throwable.trailY = throwable.position.y
  throwable.trailDirX = smoothDirX
  throwable.trailDirY = smoothDirY
}

export const emitProjectileTrailEnd = (
  world: WorldState,
  x: number,
  y: number,
  velocityX: number,
  velocityY: number,
  kind: "ballistic" | "flame" | "grenade" | "rocket",
) => {
  const speed = Math.hypot(velocityX, velocityY)
  if (speed <= 0.04) {
    return
  }

  const directionX = velocityX / speed
  const directionY = velocityY / speed
  const count = kind === "flame" ? 1 : kind === "rocket" ? 3 : 2
  for (let index = 0; index < count; index += 1) {
    const back = index * (kind === "flame" ? 0.14 : kind === "rocket" ? 0.18 * ROCKET_TRAIL_LENGTH_MULTIPLIER : 0.22)
    if (kind === "flame") {
      emitFlightTrailSegment(
        world,
        x - directionX * back,
        y - directionY * back,
        directionX,
        directionY,
        0.2,
        0.1 * BULLET_TRAIL_WIDTH_SCALE,
        "#ffd4a8",
        0.32,
        0.09,
      )
      continue
    }

    if (kind === "rocket") {
      const reverseX = -directionX
      const reverseY = -directionY
      const reverseNormalX = -reverseY
      const reverseNormalY = reverseX
      const lateral = randomRange(-1, 1) * (0.1 + index * 0.05)
      const flyDirX = reverseX + reverseNormalX * randomRange(-0.32, 0.32)
      const flyDirY = reverseY + reverseNormalY * randomRange(-0.32, 0.32)
      const flyLen = Math.hypot(flyDirX, flyDirY) || 1
      emitFlightTrailSegment(
        world,
        x + reverseX * back + reverseNormalX * lateral,
        y + reverseY * back + reverseNormalY * lateral,
        flyDirX / flyLen,
        flyDirY / flyLen,
        (0.18 + index * 0.03) * ROCKET_TRAIL_LENGTH_MULTIPLIER,
        0.12 * BULLET_TRAIL_WIDTH_SCALE * ROCKET_SMOKE_SIZE_SCALE,
        index === 0 ? "#2b3238" : "#1c2228",
        0.72 - index * 0.06,
        0.22 + index * 0.07,
        1,
        randomRange(0.5, 1.35),
        randomRange(0.52, 1.08),
        randomRange(0.62, 1.24),
        randomRange(2.2, 4.8),
      )
      continue
    }

    emitFlightTrailSegment(
      world,
      x - directionX * back,
      y - directionY * back,
      directionX,
      directionY,
      0.42 - index * 0.12,
      0.038 * BULLET_TRAIL_WIDTH_SCALE,
      BULLET_TRAIL_COLOR,
      0.76 - index * 0.22,
      0.1 + index * 0.03,
    )
  }
}

export const emitThrowableTrailEnd = (
  world: WorldState,
  x: number,
  y: number,
  velocityX: number,
  velocityY: number,
  mode: "grenade" | "molotov",
) => {
  const speed = Math.hypot(velocityX, velocityY)
  if (speed <= 0.05) {
    return
  }

  const directionX = velocityX / speed
  const directionY = velocityY / speed
  if (mode === "grenade") {
    emitFlightTrailSegment(
      world,
      x,
      y,
      directionX,
      directionY,
      0.7,
      0.09 * SECONDARY_TRAIL_WIDTH_SCALE,
      "#f5f8ea",
      0.5,
      0.16,
    )
    return
  }

  emitFlightTrailSegment(
    world,
    x,
    y,
    directionX,
    directionY,
    0.46,
    0.1 * SECONDARY_TRAIL_WIDTH_SCALE,
    "#ffd2a2",
    0.4,
    0.12,
  )
}

export const updateFlightTrailEmitters = (world: WorldState, fogCullBounds: CullBounds) => {
  for (const projectile of world.projectiles) {
    emitProjectileTrail(world, projectile, fogCullBounds)
  }

  for (const throwable of world.throwables) {
    emitThrowableTrail(world, throwable, fogCullBounds)
  }
}

export const updateFlightTrails = (world: WorldState, dt: number, fogCullBounds?: CullBounds) => {
  for (const trail of world.flightTrails) {
    if (!trail.active) {
      continue
    }

    if (
      fogCullBounds &&
      !isInsideFogCullBounds(
        trail.position.x,
        trail.position.y,
        fogCullBounds,
        trail.length + trail.width + 0.35,
      )
    ) {
      trail.active = false
      continue
    }

    trail.life -= dt
    if (trail.life <= 0) {
      trail.active = false
      continue
    }

    if (trail.style > 0.5) {
      const lifeRatio = Math.max(0, Math.min(1, trail.life / Math.max(0.00001, trail.maxLife)))
      const age = 1 - lifeRatio
      const swirl = Math.sin((trail.position.x + trail.position.y) * 2.2 + age * (9 + trail.turbulence * 2.6))
      const turn = swirl * trail.turbulence * dt * 0.72
      const cosTurn = Math.cos(turn)
      const sinTurn = Math.sin(turn)
      const nextDirX = trail.direction.x * cosTurn - trail.direction.y * sinTurn
      const nextDirY = trail.direction.x * sinTurn + trail.direction.y * cosTurn
      const dirLength = Math.hypot(nextDirX, nextDirY) || 1
      trail.direction.x = nextDirX / dirLength
      trail.direction.y = nextDirY / dirLength

      const drift = Math.max(0, trail.driftSpeed)
      trail.position.x += trail.direction.x * drift * dt
      trail.position.y += trail.direction.y * drift * dt
      trail.driftSpeed = Math.max(0, drift - trail.driftDrag * dt)

      const growthStep = trail.growth * dt
      trail.width = Math.max(0.01, trail.width + growthStep * 0.8)
      trail.length = Math.max(0.02, trail.length + growthStep)
    }
  }
}

export const cullHiddenDamagePopups = (world: WorldState, fogCullBounds: CullBounds) => {
  for (const popup of world.damagePopups) {
    if (!popup.active) {
      continue
    }

    if (!isInsideFogCullBounds(popup.position.x, popup.position.y, fogCullBounds, 0.9)) {
      popup.active = false
    }
  }
}
