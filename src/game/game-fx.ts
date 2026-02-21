import { type CullBounds, isInsideCullBounds } from "./cull.ts"
import { type Unit } from "./entities.ts"
import { type DamageSource } from "./systems/combat-damage.ts"
import { applyObstacleRicochet } from "./systems/obstacle-ricochet.ts"
import {
  isObstacleCellSolid,
  OBSTACLE_MATERIAL_BOX,
  OBSTACLE_MATERIAL_HEDGE,
  OBSTACLE_MATERIAL_ROCK,
  OBSTACLE_MATERIAL_WALL,
  OBSTACLE_MATERIAL_WAREHOUSE,
  obstacleGridToWorldCenter,
  worldToObstacleGrid,
} from "./world/obstacle-grid.ts"
import type { WorldState } from "./world/state.ts"
import { clamp, distSquared, randomRange } from "./utils.ts"

const KILL_PETAL_COLORS = ["#8bff92", "#5cf47a", "#b4ffb8"]
const RAGDOLL_FLIGHT_TIME_SECONDS = 0.35
const RAGDOLL_MAX_ANGULAR_SPEED = 14
const RAGDOLL_MAX_TRAVEL_DISTANCE = 28
const RAGDOLL_RICOCHET_RESTITUTION = 0.72
const RAGDOLL_RICOCHET_TANGENT_FRICTION = 0.9
const RAGDOLL_RICOCHET_JITTER_RADIANS = 0.16

type FogCullBounds = CullBounds

export function updateExplosions(world: WorldState, dt: number) {
  for (const explosion of world.explosions) {
    if (!explosion.active) {
      continue
    }

    explosion.life -= dt
    if (explosion.life <= 0) {
      explosion.active = false
    }
  }
}

export function obstacleDebrisPalette(material: number) {
  if (material === OBSTACLE_MATERIAL_BOX) {
    return ["#df6f3f", "#f6e5a8", "#6f2d2b"]
  }
  if (material === OBSTACLE_MATERIAL_WALL) {
    return ["#ab6850", "#874b39", "#6e3528"]
  }
  if (material === OBSTACLE_MATERIAL_WAREHOUSE) {
    return ["#9ca293", "#757b70", "#5f655d"]
  }
  if (material === OBSTACLE_MATERIAL_ROCK) {
    return ["#8f948b", "#676a64", "#5d605a"]
  }
  if (material === OBSTACLE_MATERIAL_HEDGE) {
    return ["#d2e6c7", "#a9c99a", "#496d41"]
  }
  return ["#b9beb5", "#8f948b", "#696f67"]
}

export function allocObstacleDebris(world: WorldState, obstacleDebrisCursor: number) {
  const pool = world.obstacleDebris
  const length = pool.length
  for (let index = 0; index < length; index += 1) {
    const candidateIndex = (obstacleDebrisCursor + index) % length
    const candidate = pool[candidateIndex]
    if (!candidate.active) {
      return { slot: candidate, obstacleDebrisCursor: (candidateIndex + 1) % length }
    }
  }

  const slot = pool[obstacleDebrisCursor]
  return { slot, obstacleDebrisCursor: (obstacleDebrisCursor + 1) % length }
}

export function spawnObstacleDebris(
  world: WorldState,
  obstacleDebrisCursor: number,
  x: number,
  y: number,
  material: number,
) {
  const palette = obstacleDebrisPalette(material)
  const pieces = material === OBSTACLE_MATERIAL_BOX ? 12 : 8
  let cursor = obstacleDebrisCursor

  for (let index = 0; index < pieces; index += 1) {
    const allocated = allocObstacleDebris(world, cursor)
    const slot = allocated.slot
    cursor = allocated.obstacleDebrisCursor
    const angle = Math.random() * Math.PI * 2
    const speed = randomRange(2.5, 7.8)
    slot.active = true
    slot.position.set(x + randomRange(-0.22, 0.22), y + randomRange(-0.22, 0.22))
    slot.velocity.set(Math.cos(angle) * speed, Math.sin(angle) * speed - randomRange(0.2, 1.4))
    slot.rotation = Math.random() * Math.PI * 2
    slot.angularVelocity = randomRange(-7.2, 7.2)
    slot.size = randomRange(0.08, 0.2)
    slot.maxLife = randomRange(0.24, 0.52)
    slot.life = slot.maxLife
    slot.color = palette[Math.floor(Math.random() * palette.length)]
  }

  return cursor
}

export function spawnObstacleChipFx(
  world: WorldState,
  obstacleDebrisCursor: number,
  x: number,
  y: number,
  material: number,
  damage: number,
) {
  const palette = obstacleDebrisPalette(material)
  const basePieces = material === OBSTACLE_MATERIAL_BOX ? 4 : 3
  const pieces = Math.max(2, Math.min(8, Math.round(basePieces + damage * 1.5)))
  let cursor = obstacleDebrisCursor

  for (let index = 0; index < pieces; index += 1) {
    const allocated = allocObstacleDebris(world, cursor)
    const slot = allocated.slot
    cursor = allocated.obstacleDebrisCursor
    const angle = Math.random() * Math.PI * 2
    const speed = randomRange(1.8, 5.4)
    slot.active = true
    slot.position.set(x + randomRange(-0.16, 0.16), y + randomRange(-0.16, 0.16))
    slot.velocity.set(Math.cos(angle) * speed, Math.sin(angle) * speed - randomRange(0.1, 1.1))
    slot.rotation = Math.random() * Math.PI * 2
    slot.angularVelocity = randomRange(-8.6, 8.6)
    slot.size = randomRange(0.05, 0.12)
    slot.maxLife = randomRange(0.14, 0.3)
    slot.life = slot.maxLife
    slot.color = palette[Math.floor(Math.random() * palette.length)]
  }

  return cursor
}

export function updateObstacleDebris(
  world: WorldState,
  dt: number,
  fogCullBounds?: FogCullBounds,
  padding = 0,
) {
  const drag = clamp(1 - dt * 5.6, 0, 1)
  for (const debris of world.obstacleDebris) {
    if (!debris.active) {
      continue
    }

    if (
      fogCullBounds &&
      !isInsideCullBounds(debris.position.x, debris.position.y, fogCullBounds, debris.size + 0.35 + padding)
    ) {
      debris.active = false
      continue
    }

    debris.life -= dt
    if (debris.life <= 0) {
      debris.active = false
      continue
    }

    debris.velocity.x *= drag
    debris.velocity.y = debris.velocity.y * drag + dt * 12.5
    debris.position.x += debris.velocity.x * dt
    debris.position.y += debris.velocity.y * dt
    debris.rotation += debris.angularVelocity * dt
  }
}

export function allocKillPetal(world: WorldState, killPetalCursor: number) {
  const pool = world.killPetals
  const length = pool.length
  for (let index = 0; index < length; index += 1) {
    const candidateIndex = (killPetalCursor + index) % length
    const candidate = pool[candidateIndex]
    if (!candidate.active) {
      return { slot: candidate, killPetalCursor: (candidateIndex + 1) % length }
    }
  }

  const slot = pool[killPetalCursor]
  return { slot, killPetalCursor: (killPetalCursor + 1) % length }
}

export function spawnKillPetalBurst(world: WorldState, killPetalCursor: number, x: number, y: number) {
  const count = 22
  let cursor = killPetalCursor
  for (let index = 0; index < count; index += 1) {
    const allocated = allocKillPetal(world, cursor)
    const petal = allocated.slot
    cursor = allocated.killPetalCursor
    const angle = Math.random() * Math.PI * 2
    const speed = randomRange(6.4, 21.6)
    petal.active = true
    petal.position.set(
      x + randomRange(-0.18, 0.18),
      y + randomRange(-0.18, 0.18),
    )
    petal.velocity.set(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
    )
    petal.rotation = randomRange(0, Math.PI * 2)
    petal.angularVelocity = randomRange(-12.5, 12.5)
    petal.size = randomRange(0.06, 0.14)
    petal.maxLife = 0.25
    petal.life = petal.maxLife
    petal.color = KILL_PETAL_COLORS[Math.floor(Math.random() * KILL_PETAL_COLORS.length)]
  }

  return cursor
}

export function allocRagdoll(world: WorldState, ragdollCursor: number) {
  const pool = world.ragdolls
  const length = pool.length
  for (let index = 0; index < length; index += 1) {
    const candidateIndex = (ragdollCursor + index) % length
    const candidate = pool[candidateIndex]
    if (!candidate.active) {
      return { slot: candidate, ragdollCursor: (candidateIndex + 1) % length }
    }
  }

  const slot = pool[ragdollCursor]
  return { slot, ragdollCursor: (ragdollCursor + 1) % length }
}

export function spawnUnitRagdoll(
  world: WorldState,
  ragdollCursor: number,
  target: Unit,
  killImpulse: {
    impactX: number
    impactY: number
    damage: number
    damageSource: DamageSource
  },
) {
  const allocated = allocRagdoll(world, ragdollCursor)
  const ragdoll = allocated.slot
  const impactX = Number.isFinite(killImpulse.impactX) ? killImpulse.impactX : 0
  const impactY = Number.isFinite(killImpulse.impactY) ? killImpulse.impactY : 0
  const impactLength = Math.hypot(impactX, impactY)
  let dirX = impactX
  let dirY = impactY
  if (impactLength <= 0.000001) {
    const angle = Math.random() * Math.PI * 2
    dirX = Math.cos(angle)
    dirY = Math.sin(angle)
  } else {
    dirX /= impactLength
    dirY /= impactLength
  }

  const travelDistance = clamp(
    Number.isFinite(killImpulse.damage) ? killImpulse.damage : 0,
    0,
    RAGDOLL_MAX_TRAVEL_DISTANCE,
  )
  const travelSpeed = travelDistance / Math.max(0.000001, RAGDOLL_FLIGHT_TIME_SECONDS)

  ragdoll.active = true
  ragdoll.unitId = target.id
  ragdoll.isPlayer = target.isPlayer
  ragdoll.team = target.team
  ragdoll.position.copy(target.position)
  ragdoll.velocity.set(dirX * travelSpeed, dirY * travelSpeed)
  ragdoll.rotation = Math.atan2(dirY, dirX) + randomRange(-0.36, 0.36)
  ragdoll.angularVelocity = randomRange(-RAGDOLL_MAX_ANGULAR_SPEED, RAGDOLL_MAX_ANGULAR_SPEED) *
    clamp(travelDistance / 20, 0.25, 1.4)
  ragdoll.radius = target.radius
  ragdoll.maxLife = travelDistance
  ragdoll.life = travelDistance
  return allocated.ragdollCursor
}

export function updateRagdolls(world: WorldState, dt: number) {
  const ragdollCollidesObstacle = (x: number, y: number, radius: number) => {
    const grid = world.obstacleGrid
    const min = worldToObstacleGrid(grid.size, x - radius, y - radius)
    const max = worldToObstacleGrid(grid.size, x + radius, y + radius)
    const minX = Math.max(0, min.x)
    const maxX = Math.min(grid.size - 1, max.x)
    const minY = Math.max(0, min.y)
    const maxY = Math.min(grid.size - 1, max.y)

    for (let gy = minY; gy <= maxY; gy += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
        if (!isObstacleCellSolid(grid, gx, gy)) {
          continue
        }

        const center = obstacleGridToWorldCenter(grid.size, gx, gy)
        const nearestX = clamp(x, center.x - 0.5, center.x + 0.5)
        const nearestY = clamp(y, center.y - 0.5, center.y + 0.5)
        if (distSquared(x, y, nearestX, nearestY) <= radius * radius) {
          return true
        }
      }
    }

    return false
  }

  for (const ragdoll of world.ragdolls) {
    if (!ragdoll.active) {
      continue
    }

    if (
      !Number.isFinite(ragdoll.position.x) ||
      !Number.isFinite(ragdoll.position.y) ||
      !Number.isFinite(ragdoll.velocity.x) ||
      !Number.isFinite(ragdoll.velocity.y) ||
      !Number.isFinite(ragdoll.rotation) ||
      !Number.isFinite(ragdoll.angularVelocity) ||
      !Number.isFinite(ragdoll.life)
    ) {
      ragdoll.active = false
      continue
    }

    if (ragdoll.life <= 0) {
      ragdoll.active = false
      continue
    }

    const speed = Math.hypot(ragdoll.velocity.x, ragdoll.velocity.y)
    if (!Number.isFinite(speed) || speed <= 0.000001) {
      ragdoll.active = false
      continue
    }

    const stepDistance = Math.min(speed * dt, ragdoll.life)
    const startX = ragdoll.position.x
    const startY = ragdoll.position.y
    const stepTime = stepDistance / speed
    const moveX = ragdoll.velocity.x * stepTime
    const moveY = ragdoll.velocity.y * stepTime
    const moveLength = Math.hypot(moveX, moveY)
    const sampleSpacing = Math.max(0.08, ragdoll.radius * 0.35)
    const sampleCount = Math.max(1, Math.ceil(moveLength / sampleSpacing))
    let nextX = startX
    let nextY = startY
    let hitObstacle = false
    let collisionX = startX
    let collisionY = startY

    for (let sample = 1; sample <= sampleCount; sample += 1) {
      const t = sample / sampleCount
      const sampleX = startX + moveX * t
      const sampleY = startY + moveY * t
      if (ragdollCollidesObstacle(sampleX, sampleY, ragdoll.radius)) {
        hitObstacle = true
        collisionX = sampleX
        collisionY = sampleY
        break
      }

      nextX = sampleX
      nextY = sampleY
    }

    if (hitObstacle) {
      ragdoll.position.x = collisionX
      ragdoll.position.y = collisionY
      applyObstacleRicochet({
        obstacleGrid: world.obstacleGrid,
        previousX: startX,
        previousY: startY,
        position: ragdoll.position,
        velocity: ragdoll.velocity,
        restitution: RAGDOLL_RICOCHET_RESTITUTION,
        tangentFriction: RAGDOLL_RICOCHET_TANGENT_FRICTION,
        jitterRadians: RAGDOLL_RICOCHET_JITTER_RADIANS,
        separation: 0.02,
      })
    } else {
      ragdoll.position.x = nextX
      ragdoll.position.y = nextY
    }

    ragdoll.rotation += ragdoll.angularVelocity * stepTime
    ragdoll.life -= stepDistance
    if (ragdoll.life <= 0) {
      ragdoll.active = false
    }
  }
}

export function updateKillPetals(world: WorldState, dt: number, fogCullBounds?: FogCullBounds, padding = 0) {
  const drag = clamp(1 - dt * 2.8, 0, 1)
  for (const petal of world.killPetals) {
    if (!petal.active) {
      continue
    }

    if (
      fogCullBounds &&
      !isInsideCullBounds(petal.position.x, petal.position.y, fogCullBounds, petal.size + 0.65 + padding)
    ) {
      petal.active = false
      continue
    }

    petal.life -= dt
    if (petal.life <= 0) {
      petal.active = false
      continue
    }

    petal.velocity.x *= drag
    petal.velocity.y *= drag
    petal.position.x += petal.velocity.x * dt
    petal.position.y += petal.velocity.y * dt
    petal.rotation += petal.angularVelocity * dt
  }
}

export function allocExplosion(world: WorldState, explosionCursor: number) {
  const pool = world.explosions
  const length = pool.length
  for (let index = 0; index < length; index += 1) {
    const candidateIndex = (explosionCursor + index) % length
    const candidate = pool[candidateIndex]
    if (!candidate.active) {
      return { slot: candidate, explosionCursor: (candidateIndex + 1) % length }
    }
  }

  const slot = pool[explosionCursor]
  return { slot, explosionCursor: (explosionCursor + 1) % length }
}

export function spawnExplosion(world: WorldState, explosionCursor: number, x: number, y: number, radius: number) {
  const allocated = allocExplosion(world, explosionCursor)
  const slot = allocated.slot
  slot.active = true
  slot.position.set(x, y)
  slot.radius = radius
  slot.life = 0.24
  return allocated.explosionCursor
}
