import { clamp, distSquared } from "../utils.ts"
import type { WorldState } from "../world/state.ts"
import { applyObstacleRicochet } from "./obstacle-ricochet.ts"

export const ROCKET_PROXIMITY_RADIUS = 1.2
export const GRENADE_PROXIMITY_RADIUS = 1.25
export const GRENADE_PROJECTILE_MAX_RICOCHETS = 2
export const GRENADE_PROJECTILE_RICOCHET_RESTITUTION = 0.58
export const GRENADE_PROJECTILE_RICOCHET_TANGENT_FRICTION = 0.78
export const GRENADE_PROJECTILE_RICOCHET_MIN_SPEED = 2.8
export const GRENADE_PROJECTILE_RICOCHET_RANDOM_RADIANS = 0.45
export const BALLISTIC_RICOCHET_MIN_SPEED = 4

const ROCKET_HOMING_SEARCH_RADIUS = 18
const ROCKET_HOMING_MIN_ALIGNMENT = 0.2
const ROCKET_HOMING_TURN_RATE = 2.8
const ROCKET_HOMING_MAX_BLEND_PER_TICK = 0.14
const BALLISTIC_RICOCHET_RESTITUTION = 0.72
const BALLISTIC_RICOCHET_TANGENT_FRICTION = 0.9
const BALLISTIC_RICOCHET_DAMAGE_SCALE = 0.8
const PROJECTILE_BROADPHASE_BUCKET_SIZE = 3
const PROJECTILE_BROADPHASE_KEY_OFFSET = 2048
const PROJECTILE_BROADPHASE_KEY_STRIDE = 4096

const bucketKey = (x: number, y: number) => {
  return (x + PROJECTILE_BROADPHASE_KEY_OFFSET) * PROJECTILE_BROADPHASE_KEY_STRIDE +
    (y + PROJECTILE_BROADPHASE_KEY_OFFSET)
}

export interface ProjectileBroadphase {
  unitBucketIndices: Map<number, number[]>
  maxUnitRadius: number
}

export const buildProjectileBroadphase = (world: WorldState): ProjectileBroadphase => {
  const unitBucketIndices = new Map<number, number[]>()
  let maxUnitRadius = 0

  for (let unitIndex = 0; unitIndex < world.units.length; unitIndex += 1) {
    const unit = world.units[unitIndex]
    maxUnitRadius = Math.max(maxUnitRadius, unit.radius)
    const cellX = Math.floor(unit.position.x / PROJECTILE_BROADPHASE_BUCKET_SIZE)
    const cellY = Math.floor(unit.position.y / PROJECTILE_BROADPHASE_BUCKET_SIZE)
    const key = bucketKey(cellX, cellY)
    const bucket = unitBucketIndices.get(key)
    if (bucket) {
      bucket.push(unitIndex)
    } else {
      unitBucketIndices.set(key, [unitIndex])
    }
  }

  return {
    unitBucketIndices,
    maxUnitRadius,
  }
}

export const forEachNearbyProjectileUnit = (
  world: WorldState,
  broadphase: ProjectileBroadphase,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  visit: (unit: WorldState["units"][number]) => boolean,
) => {
  const minCellX = Math.floor(minX / PROJECTILE_BROADPHASE_BUCKET_SIZE)
  const maxCellX = Math.floor(maxX / PROJECTILE_BROADPHASE_BUCKET_SIZE)
  const minCellY = Math.floor(minY / PROJECTILE_BROADPHASE_BUCKET_SIZE)
  const maxCellY = Math.floor(maxY / PROJECTILE_BROADPHASE_BUCKET_SIZE)

  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const bucket = broadphase.unitBucketIndices.get(bucketKey(cellX, cellY))
      if (!bucket) {
        continue
      }

      for (let index = 0; index < bucket.length; index += 1) {
        const unit = world.units[bucket[index]]
        if (visit(unit)) {
          return true
        }
      }
    }
  }

  return false
}

export const distToSegmentSquared = (
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) => {
  const segmentX = endX - startX
  const segmentY = endY - startY
  const lengthSquared = segmentX * segmentX + segmentY * segmentY
  if (lengthSquared <= 0.000001) {
    return distSquared(pointX, pointY, startX, startY)
  }

  const projection = ((pointX - startX) * segmentX + (pointY - startY) * segmentY) / lengthSquared
  const t = clamp(projection, 0, 1)
  const nearestX = startX + segmentX * t
  const nearestY = startY + segmentY * t
  return distSquared(pointX, pointY, nearestX, nearestY)
}

export const steerRocketTowardNearbyEnemy = (
  world: WorldState,
  broadphase: ProjectileBroadphase,
  projectile: WorldState["projectiles"][number],
  dt: number,
) => {
  const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
  if (speed <= 0.00001) {
    return
  }

  const currentDirX = projectile.velocity.x / speed
  const currentDirY = projectile.velocity.y / speed
  let targetDirX = 0
  let targetDirY = 0
  let bestScore = Number.NEGATIVE_INFINITY
  const searchRadius = ROCKET_HOMING_SEARCH_RADIUS + broadphase.maxUnitRadius

  forEachNearbyProjectileUnit(
    world,
    broadphase,
    projectile.position.x - searchRadius,
    projectile.position.y - searchRadius,
    projectile.position.x + searchRadius,
    projectile.position.y + searchRadius,
    (unit) => {
      if (unit.id === projectile.ownerId || unit.team === projectile.ownerTeam) {
        return false
      }

      const toEnemyX = unit.position.x - projectile.position.x
      const toEnemyY = unit.position.y - projectile.position.y
      const distanceSquared = toEnemyX * toEnemyX + toEnemyY * toEnemyY
      if (distanceSquared <= 0.00001) {
        return false
      }

      const homingRadius = ROCKET_HOMING_SEARCH_RADIUS + unit.radius
      if (distanceSquared > homingRadius * homingRadius) {
        return false
      }

      const distance = Math.sqrt(distanceSquared)
      const desiredDirX = toEnemyX / distance
      const desiredDirY = toEnemyY / distance
      const alignment = currentDirX * desiredDirX + currentDirY * desiredDirY
      if (alignment < ROCKET_HOMING_MIN_ALIGNMENT) {
        return false
      }

      const distanceScore = 1 - clamp(distance / homingRadius, 0, 1)
      const score = alignment * 0.75 + distanceScore * 0.25
      if (score <= bestScore) {
        return false
      }

      bestScore = score
      targetDirX = desiredDirX
      targetDirY = desiredDirY
      return false
    },
  )

  if (!Number.isFinite(bestScore)) {
    return
  }

  const blend = clamp(dt * ROCKET_HOMING_TURN_RATE, 0, ROCKET_HOMING_MAX_BLEND_PER_TICK)
  if (blend <= 0) {
    return
  }

  const steeredDirX = currentDirX * (1 - blend) + targetDirX * blend
  const steeredDirY = currentDirY * (1 - blend) + targetDirY * blend
  const steeredLength = Math.hypot(steeredDirX, steeredDirY)
  if (steeredLength <= 0.00001) {
    return
  }

  projectile.velocity.x = (steeredDirX / steeredLength) * speed
  projectile.velocity.y = (steeredDirY / steeredLength) * speed
}

export const ricochetBallisticProjectile = (
  world: WorldState,
  projectile: WorldState["projectiles"][number],
  previousX: number,
  previousY: number,
) => {
  applyObstacleRicochet({
    obstacleGrid: world.obstacleGrid,
    previousX,
    previousY,
    position: projectile.position,
    velocity: projectile.velocity,
    restitution: BALLISTIC_RICOCHET_RESTITUTION,
    tangentFriction: BALLISTIC_RICOCHET_TANGENT_FRICTION,
    jitterRadians: 0,
    separation: 0.02,
  })

  projectile.velocity.x *= 0.78
  projectile.velocity.y *= 0.78
  projectile.damage *= BALLISTIC_RICOCHET_DAMAGE_SCALE
  projectile.ballisticRicochetRemaining = Math.max(0, projectile.ballisticRicochetRemaining - 1)
}

export const ricochetBallisticProjectileOnArenaBorder = (
  world: WorldState,
  projectile: WorldState["projectiles"][number],
) => {
  const distance = projectile.position.length()
  if (distance <= 0.00001) {
    return
  }

  const maxDistance = Math.max(0, world.arenaRadius - projectile.radius)
  let normalX = projectile.position.x / distance
  let normalY = projectile.position.y / distance
  projectile.position.x = normalX * maxDistance
  projectile.position.y = normalY * maxDistance

  const velocityDotNormal = projectile.velocity.x * normalX + projectile.velocity.y * normalY
  const normalVelocityX = velocityDotNormal * normalX
  const normalVelocityY = velocityDotNormal * normalY
  const tangentVelocityX = projectile.velocity.x - normalVelocityX
  const tangentVelocityY = projectile.velocity.y - normalVelocityY

  projectile.velocity.x = -normalVelocityX * BALLISTIC_RICOCHET_RESTITUTION +
    tangentVelocityX * BALLISTIC_RICOCHET_TANGENT_FRICTION
  projectile.velocity.y = -normalVelocityY * BALLISTIC_RICOCHET_RESTITUTION +
    tangentVelocityY * BALLISTIC_RICOCHET_TANGENT_FRICTION

  projectile.velocity.x *= 0.78
  projectile.velocity.y *= 0.78
  projectile.damage *= BALLISTIC_RICOCHET_DAMAGE_SCALE
  projectile.ballisticRicochetRemaining = Math.max(0, projectile.ballisticRicochetRemaining - 1)

  normalX = -normalX
  normalY = -normalY
  projectile.position.x += normalX * 0.02
  projectile.position.y += normalY * 0.02
}
