import { clamp, distSquared } from "../utils.ts"
import type { WorldState } from "../world/state.ts"
import type { Team } from "../types.ts"
import { applyObstacleRicochet } from "./obstacle-ricochet.ts"

const ROCKET_PROXIMITY_RADIUS = 1.2
const ROCKET_HOMING_SEARCH_RADIUS = 18
const ROCKET_HOMING_MIN_ALIGNMENT = 0.2
const ROCKET_HOMING_TURN_RATE = 2.8
const ROCKET_HOMING_MAX_BLEND_PER_TICK = 0.14
const GRENADE_PROXIMITY_RADIUS = 1.25
const GRENADE_PROJECTILE_MAX_RICOCHETS = 2
const GRENADE_PROJECTILE_RICOCHET_RESTITUTION = 0.58
const GRENADE_PROJECTILE_RICOCHET_TANGENT_FRICTION = 0.78
const GRENADE_PROJECTILE_RICOCHET_MIN_SPEED = 2.8
const GRENADE_PROJECTILE_RICOCHET_RANDOM_RADIANS = 0.45
const BALLISTIC_RICOCHET_RESTITUTION = 0.72
const BALLISTIC_RICOCHET_TANGENT_FRICTION = 0.9
const BALLISTIC_RICOCHET_MIN_SPEED = 4
const BALLISTIC_RICOCHET_DAMAGE_SCALE = 0.8
const PROJECTILE_BROADPHASE_BUCKET_SIZE = 3
const PROJECTILE_BROADPHASE_KEY_OFFSET = 2048
const PROJECTILE_BROADPHASE_KEY_STRIDE = 4096

const bucketKey = (x: number, y: number) => {
  return (x + PROJECTILE_BROADPHASE_KEY_OFFSET) * PROJECTILE_BROADPHASE_KEY_STRIDE +
    (y + PROJECTILE_BROADPHASE_KEY_OFFSET)
}

interface ProjectileBroadphase {
  unitBucketIndices: Map<number, number[]>
  maxUnitRadius: number
}

const buildProjectileBroadphase = (world: WorldState): ProjectileBroadphase => {
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

const forEachNearbyProjectileUnit = (
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

const distToSegmentSquared = (
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

const steerRocketTowardNearbyEnemy = (
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

const ricochetBallisticProjectile = (
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

const ricochetBallisticProjectileOnArenaBorder = (
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

export interface ProjectileDeps {
  hitObstacle: (projectileIndex: number) => boolean
  spawnFlamePatch: (x: number, y: number, ownerId: string, ownerTeam: Team) => void
  explodeProjectile?: (projectile: WorldState["projectiles"][number]) => void
  onTrailEnd?: (
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    kind: "ballistic" | "flame" | "grenade" | "rocket",
  ) => void
  applyDamage: (
    targetId: string,
    amount: number,
    sourceId: string,
    sourceTeam: Team,
    hitX: number,
    hitY: number,
    impactX: number,
    impactY: number,
  ) => void
}

export const updateProjectiles = (world: WorldState, dt: number, deps: ProjectileDeps) => {
  const broadphase = buildProjectileBroadphase(world)

  const deactivateProjectile = (
    projectileIndex: number,
    createFlamePatch: boolean,
    explode = false,
  ) => {
    const projectile = world.projectiles[projectileIndex]
    if (!projectile.active) {
      return
    }

    deps.onTrailEnd?.(
      projectile.position.x,
      projectile.position.y,
      projectile.velocity.x,
      projectile.velocity.y,
      projectile.kind,
    )

    const shouldSpawnPatch = projectile.kind === "flame" && createFlamePatch
    if (shouldSpawnPatch) {
      deps.spawnFlamePatch(projectile.position.x, projectile.position.y, projectile.ownerId, projectile.ownerTeam)
    }

    if (explode) {
      deps.explodeProjectile?.(projectile)
    }

    projectile.active = false
  }

  for (let projectileIndex = 0; projectileIndex < world.projectiles.length; projectileIndex += 1) {
    const projectile = world.projectiles[projectileIndex]
    if (!projectile.active) {
      continue
    }

    if (projectile.acceleration > 0) {
      const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
      if (speed > 0.00001) {
        const nextSpeed = speed + projectile.acceleration * dt
        const speedScale = nextSpeed / speed
        projectile.velocity.x *= speedScale
        projectile.velocity.y *= speedScale
      }
    }

    if (projectile.kind === "rocket") {
      steerRocketTowardNearbyEnemy(world, broadphase, projectile, dt)
    }

    const previousX = projectile.position.x
    const previousY = projectile.position.y
    const isExplosive = projectile.kind === "grenade" || projectile.kind === "rocket"
    const stepX = projectile.velocity.x * dt
    const stepY = projectile.velocity.y * dt
    projectile.position.x += stepX
    projectile.position.y += stepY
    projectile.traveled += Math.hypot(stepX, stepY)
    projectile.ttl -= dt

    if (
      !Number.isFinite(projectile.position.x) ||
      !Number.isFinite(projectile.position.y) ||
      !Number.isFinite(projectile.velocity.x) ||
      !Number.isFinite(projectile.velocity.y)
    ) {
      deactivateProjectile(projectileIndex, false)
      continue
    }

    if (projectile.ttl <= 0) {
      deactivateProjectile(projectileIndex, true, isExplosive)
      continue
    }

    const progress = projectile.traveled / projectile.maxRange
    if (progress > 0.62 && projectile.kind !== "rocket") {
      const drag = clamp(1 - dt * (5 + progress * 10), 0, 1)
      projectile.velocity.x *= drag
      projectile.velocity.y *= drag
    }

    const speedSquared = projectile.velocity.x * projectile.velocity.x + projectile.velocity.y * projectile.velocity.y
    if (progress >= 1 || (progress > 0.72 && speedSquared < 16) || speedSquared < 0.36) {
      deactivateProjectile(projectileIndex, true, isExplosive)
      continue
    }

    const arenaDistance = projectile.position.length()
    const arenaMaxDistance = Math.max(0, world.arenaRadius - projectile.radius)
    if (arenaDistance > arenaMaxDistance) {
      if (projectile.kind === "grenade" && projectile.ricochets < GRENADE_PROJECTILE_MAX_RICOCHETS) {
        const normalX = arenaDistance > 0.00001 ? projectile.position.x / arenaDistance : 1
        const normalY = arenaDistance > 0.00001 ? projectile.position.y / arenaDistance : 0
        projectile.position.x = normalX * arenaMaxDistance
        projectile.position.y = normalY * arenaMaxDistance

        const velocityDotNormal = projectile.velocity.x * normalX + projectile.velocity.y * normalY
        const normalVelocityX = velocityDotNormal * normalX
        const normalVelocityY = velocityDotNormal * normalY
        const tangentVelocityX = projectile.velocity.x - normalVelocityX
        const tangentVelocityY = projectile.velocity.y - normalVelocityY

        projectile.velocity.x = -normalVelocityX * GRENADE_PROJECTILE_RICOCHET_RESTITUTION +
          tangentVelocityX * GRENADE_PROJECTILE_RICOCHET_TANGENT_FRICTION
        projectile.velocity.y = -normalVelocityY * GRENADE_PROJECTILE_RICOCHET_RESTITUTION +
          tangentVelocityY * GRENADE_PROJECTILE_RICOCHET_TANGENT_FRICTION

        const ricochetJitter = (Math.random() * 2 - 1) * GRENADE_PROJECTILE_RICOCHET_RANDOM_RADIANS
        const jitterCos = Math.cos(ricochetJitter)
        const jitterSin = Math.sin(ricochetJitter)
        const jitteredVelocityX = projectile.velocity.x * jitterCos - projectile.velocity.y * jitterSin
        const jitteredVelocityY = projectile.velocity.x * jitterSin + projectile.velocity.y * jitterCos
        projectile.velocity.x = jitteredVelocityX
        projectile.velocity.y = jitteredVelocityY

        projectile.position.x -= normalX * 0.02
        projectile.position.y -= normalY * 0.02
        projectile.ricochets += 1

        const ricochetSpeedSquared = projectile.velocity.x * projectile.velocity.x +
          projectile.velocity.y * projectile.velocity.y
        if (ricochetSpeedSquared < GRENADE_PROJECTILE_RICOCHET_MIN_SPEED * GRENADE_PROJECTILE_RICOCHET_MIN_SPEED) {
          deactivateProjectile(projectileIndex, true, true)
        }
        continue
      }

      if (projectile.kind === "ballistic" && projectile.ballisticRicochetRemaining > 0) {
        ricochetBallisticProjectileOnArenaBorder(world, projectile)
        const ballisticSpeedSquared = projectile.velocity.x * projectile.velocity.x +
          projectile.velocity.y * projectile.velocity.y
        if (
          ballisticSpeedSquared < BALLISTIC_RICOCHET_MIN_SPEED * BALLISTIC_RICOCHET_MIN_SPEED || projectile.damage < 0.8
        ) {
          deactivateProjectile(projectileIndex, true)
        }
        continue
      }

      if (arenaDistance > world.arenaRadius + 4) {
        deactivateProjectile(projectileIndex, false)
        continue
      }

      deactivateProjectile(projectileIndex, false, isExplosive)
      continue
    }

    if (projectile.kind === "rocket") {
      const proximityBonus = Math.max(0, projectile.proximityRadiusBonus)
      const searchRadius = projectile.radius + ROCKET_PROXIMITY_RADIUS + proximityBonus + broadphase.maxUnitRadius
      const proximityFuseTriggered = forEachNearbyProjectileUnit(
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

          const fuseRadius = unit.radius + projectile.radius + ROCKET_PROXIMITY_RADIUS + proximityBonus
          return distSquared(unit.position.x, unit.position.y, projectile.position.x, projectile.position.y) <=
            fuseRadius * fuseRadius
        },
      )

      if (proximityFuseTriggered) {
        deactivateProjectile(projectileIndex, true, true)
        continue
      }
    }

    if (projectile.kind === "grenade") {
      const proximityBonus = Math.max(0, projectile.proximityRadiusBonus)
      const searchRadius = projectile.radius + GRENADE_PROXIMITY_RADIUS + proximityBonus + broadphase.maxUnitRadius
      const minSegmentX = Math.min(previousX, projectile.position.x) - searchRadius
      const maxSegmentX = Math.max(previousX, projectile.position.x) + searchRadius
      const minSegmentY = Math.min(previousY, projectile.position.y) - searchRadius
      const maxSegmentY = Math.max(previousY, projectile.position.y) + searchRadius
      const proximityFuseTriggered = forEachNearbyProjectileUnit(
        world,
        broadphase,
        minSegmentX,
        minSegmentY,
        maxSegmentX,
        maxSegmentY,
        (unit) => {
          if (unit.id === projectile.ownerId || unit.team === projectile.ownerTeam) {
            return false
          }

          const fuseRadius = unit.radius + projectile.radius + GRENADE_PROXIMITY_RADIUS + proximityBonus
          return distToSegmentSquared(
            unit.position.x,
            unit.position.y,
            previousX,
            previousY,
            projectile.position.x,
            projectile.position.y,
          ) <=
            fuseRadius * fuseRadius
        },
      )

      if (proximityFuseTriggered) {
        deactivateProjectile(projectileIndex, true, true)
        continue
      }

      const grenadeHitObstacle = deps.hitObstacle(projectileIndex)
      if (grenadeHitObstacle) {
        if (projectile.ricochets < GRENADE_PROJECTILE_MAX_RICOCHETS) {
          applyObstacleRicochet({
            obstacleGrid: world.obstacleGrid,
            previousX,
            previousY,
            position: projectile.position,
            velocity: projectile.velocity,
            restitution: GRENADE_PROJECTILE_RICOCHET_RESTITUTION,
            tangentFriction: GRENADE_PROJECTILE_RICOCHET_TANGENT_FRICTION,
            jitterRadians: GRENADE_PROJECTILE_RICOCHET_RANDOM_RADIANS,
            separation: 0.02,
          })
          projectile.ricochets += 1

          const ricochetSpeedSquared = projectile.velocity.x * projectile.velocity.x +
            projectile.velocity.y * projectile.velocity.y
          if (ricochetSpeedSquared < GRENADE_PROJECTILE_RICOCHET_MIN_SPEED * GRENADE_PROJECTILE_RICOCHET_MIN_SPEED) {
            deactivateProjectile(projectileIndex, true, true)
          }
          continue
        }

        deactivateProjectile(projectileIndex, true, true)
        continue
      }
    } else if (deps.hitObstacle(projectileIndex)) {
      if (projectile.kind === "ballistic" && projectile.ballisticRicochetRemaining > 0) {
        ricochetBallisticProjectile(world, projectile, previousX, previousY)
        const ballisticSpeedSquared = projectile.velocity.x * projectile.velocity.x +
          projectile.velocity.y * projectile.velocity.y
        if (
          ballisticSpeedSquared < BALLISTIC_RICOCHET_MIN_SPEED * BALLISTIC_RICOCHET_MIN_SPEED || projectile.damage < 0.8
        ) {
          deactivateProjectile(projectileIndex, true)
        }
        continue
      }

      deactivateProjectile(projectileIndex, true, isExplosive)
      continue
    }

    const hitSearchRadius = projectile.radius + broadphase.maxUnitRadius
    const minHitX = Math.min(previousX, projectile.position.x) - hitSearchRadius
    const maxHitX = Math.max(previousX, projectile.position.x) + hitSearchRadius
    const minHitY = Math.min(previousY, projectile.position.y) - hitSearchRadius
    const maxHitY = Math.max(previousY, projectile.position.y) + hitSearchRadius

    forEachNearbyProjectileUnit(world, broadphase, minHitX, minHitY, maxHitX, maxHitY, (unit) => {
      if (unit.id === projectile.ownerId || unit.team === projectile.ownerTeam) {
        return false
      }

      const hitDistance = unit.radius + projectile.radius
      if (
        distToSegmentSquared(
          unit.position.x,
          unit.position.y,
          previousX,
          previousY,
          projectile.position.x,
          projectile.position.y,
        ) > hitDistance * hitDistance
      ) {
        return false
      }

      if (isExplosive) {
        deactivateProjectile(projectileIndex, true, true)
        return true
      }

      const impactLength = Math.hypot(projectile.velocity.x, projectile.velocity.y) || 1
      const impactDirX = projectile.velocity.x / impactLength
      const impactDirY = projectile.velocity.y / impactLength
      const hitX = unit.position.x + impactDirX * unit.radius
      const hitY = unit.position.y + impactDirY * unit.radius
      deps.applyDamage(
        unit.id,
        projectile.damage,
        projectile.ownerId,
        projectile.ownerTeam,
        hitX,
        hitY,
        projectile.velocity.x,
        projectile.velocity.y,
      )
      deactivateProjectile(projectileIndex, true)
      return true
    })
  }
}
