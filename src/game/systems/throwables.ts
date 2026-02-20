import { clamp, distSquared, limitToArena, randomRange } from "../utils.ts"
import { GRENADE_COOLDOWN, MOLOTOV_COOLDOWN } from "../weapons.ts"
import type { Team } from "../types.ts"
import {
  damageObstacleCell,
  isObstacleCellSolid,
  obstacleGridToWorldCenter,
  worldToObstacleGrid,
} from "../world/obstacle-grid.ts"
import type { WorldState } from "../world/state.ts"
import { applyObstacleRicochet } from "./obstacle-ricochet.ts"

const MOLOTOV_THROW_SPEED = 15
const GRENADE_BULLET_DAMAGE = 20
const GRENADE_BULLET_SPEED = 20
const GRENADE_PROXIMITY_PERK_SPEED_MULTIPLIER = 1.5
const GRENADE_BULLET_RANGE = 30
const GRENADE_BULLET_TTL = GRENADE_BULLET_RANGE / GRENADE_BULLET_SPEED
const GRENADE_THROW_INACCURACY_RADIANS = 0.11
const GRENADE_MAX_RICOCHETS = 2
const GRENADE_RICOCHET_RESTITUTION = 0.58
const GRENADE_RICOCHET_TANGENT_FRICTION = 0.78
const GRENADE_RICOCHET_MIN_SPEED = 2.8
const GRENADE_RICOCHET_RANDOM_RADIANS = 0.45
const GRENADE_AIR_DRAG = 0.18
const GRENADE_PROXIMITY_RADIUS = 1.25
const GRENADE_HIT_CAMERA_SHAKE = 0.55
const GRENADE_HIT_STOP = 0.022
const THROWABLE_SPIN_MIN = 7.2
const THROWABLE_SPIN_MAX = 18.6

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

export interface ThrowSecondaryDeps {
  allocThrowable: () => WorldState["throwables"][number]
  onPlayerThrow: (mode: "grenade" | "molotov") => void
  onOtherThrow: () => void
}

export const throwSecondary = (world: WorldState, shooterId: string, deps: ThrowSecondaryDeps) => {
  const shooter = world.unitById.get(shooterId)
  if (!shooter || shooter.secondaryCooldown > 0) {
    return
  }

  let mode = shooter.secondaryMode
  if (!shooter.isPlayer && Math.random() > 0.62) {
    mode = "molotov"
  }

  const throwable = deps.allocThrowable()
  const aimAngle = Math.atan2(shooter.aim.y, shooter.aim.x)
  const throwSpread = mode === "grenade" ? (Math.random() * 2 - 1) * GRENADE_THROW_INACCURACY_RADIANS : 0
  const throwAngle = aimAngle + throwSpread
  const throwDirX = Math.cos(throwAngle)
  const throwDirY = Math.sin(throwAngle)
  const grenadeSpeed = shooter.proximityGrenades
    ? GRENADE_BULLET_SPEED * GRENADE_PROXIMITY_PERK_SPEED_MULTIPLIER
    : GRENADE_BULLET_SPEED
  const speed = mode === "grenade" ? grenadeSpeed : MOLOTOV_THROW_SPEED
  const throwableRadius = mode === "grenade" ? 0.36 : 0.3
  const throwOffset = shooter.radius + throwableRadius + 0.06

  throwable.active = true
  throwable.ownerId = shooter.id
  throwable.ownerTeam = shooter.team
  throwable.mode = mode
  throwable.position.x = shooter.position.x + throwDirX * throwOffset
  throwable.position.y = shooter.position.y + throwDirY * throwOffset
  throwable.velocity.x = throwDirX * speed
  throwable.velocity.y = throwDirY * speed
  throwable.rotation = Math.random() * Math.PI * 2
  throwable.angularVelocity = randomRange(-1, 1) * randomRange(THROWABLE_SPIN_MIN, THROWABLE_SPIN_MAX)
  throwable.life = mode === "grenade" ? GRENADE_BULLET_TTL : 0.78
  throwable.maxLife = throwable.life
  throwable.radius = throwableRadius
  throwable.ricochets = 0
  throwable.rolled = false
  throwable.trailCooldown = 0
  throwable.trailX = throwable.position.x
  throwable.trailY = throwable.position.y
  throwable.trailReady = false
  throwable.contactFuse = mode === "grenade" && shooter.proximityGrenades
  throwable.explosiveRadiusMultiplier = shooter.explosiveRadiusMultiplier

  const cooldown = mode === "grenade" ? GRENADE_COOLDOWN : MOLOTOV_COOLDOWN
  shooter.secondaryCooldown = cooldown * shooter.grenadeTimer
  shooter.secondaryCooldownMax = shooter.secondaryCooldown
  shooter.secondaryMode = mode
  shooter.recoil = Math.min(1, shooter.recoil + 0.5)

  if (shooter.isPlayer) {
    const impactFeel = Math.max(1, Math.min(2, world.impactFeelLevel || 1))
    const shakeScale = 1 + (impactFeel - 1) * 1.4
    world.cameraShake = Math.min(1.2 + (impactFeel - 1) * 1, world.cameraShake + 0.15 * shakeScale)
    deps.onPlayerThrow(mode)
  } else if (Math.random() > 0.88) {
    deps.onOtherThrow()
  }
}

export interface ThrowableUpdateDeps {
  explodeGrenade: (throwableIndex: number) => void
  igniteMolotov: (throwableIndex: number) => void
  onTrailEnd?: (
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    mode: "grenade" | "molotov",
  ) => void
  onExplosion: () => void
  onObstacleDamaged?: (x: number, y: number, material: number, damage: number) => void
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

export const updateThrowables = (world: WorldState, dt: number, deps: ThrowableUpdateDeps) => {
  const impactFeel = Math.max(1, Math.min(2, world.impactFeelLevel || 1))
  const shakeScale = 1 + (impactFeel - 1) * 2
  const hitStopScale = 1 + (impactFeel - 1) * 2
  const shakeCapBoost = (impactFeel - 1) * 1.5

  for (let throwableIndex = 0; throwableIndex < world.throwables.length; throwableIndex += 1) {
    const throwable = world.throwables[throwableIndex]
    if (!throwable.active) {
      continue
    }

    const isGrenade = throwable.mode === "grenade"
    let shouldExplode = isGrenade
    const previousX = throwable.position.x
    const previousY = throwable.position.y

    throwable.life -= dt
    throwable.position.x += throwable.velocity.x * dt
    throwable.position.y += throwable.velocity.y * dt
    throwable.rotation += throwable.angularVelocity * dt
    if (throwable.mode === "molotov") {
      throwable.velocity.x *= clamp(1 - dt * 0.55, 0, 1)
      throwable.velocity.y *= clamp(1 - dt * 0.55, 0, 1)
    } else {
      throwable.velocity.x *= clamp(1 - dt * GRENADE_AIR_DRAG, 0, 1)
      throwable.velocity.y *= clamp(1 - dt * GRENADE_AIR_DRAG, 0, 1)
    }
    limitToArena(throwable.position, throwable.radius, world.arenaRadius)

    const hitCell = worldToObstacleGrid(world.obstacleGrid.size, throwable.position.x, throwable.position.y)
    if (isObstacleCellSolid(world.obstacleGrid, hitCell.x, hitCell.y)) {
      const damage = throwable.mode === "grenade" ? 3 : 1.5
      const result = damageObstacleCell(world.obstacleGrid, hitCell.x, hitCell.y, damage)
      if (result.damageDealt > 0) {
        const center = obstacleGridToWorldCenter(world.obstacleGrid.size, hitCell.x, hitCell.y)
        deps.onObstacleDamaged?.(center.x, center.y, result.material, result.damageDealt)
      }

      if (isGrenade && throwable.ricochets < GRENADE_MAX_RICOCHETS) {
        applyObstacleRicochet({
          obstacleGrid: world.obstacleGrid,
          previousX,
          previousY,
          position: throwable.position,
          velocity: throwable.velocity,
          restitution: GRENADE_RICOCHET_RESTITUTION,
          tangentFriction: GRENADE_RICOCHET_TANGENT_FRICTION,
          jitterRadians: GRENADE_RICOCHET_RANDOM_RADIANS,
          separation: 0.02,
        })

        if (Math.hypot(throwable.velocity.x, throwable.velocity.y) < GRENADE_RICOCHET_MIN_SPEED) {
          throwable.ricochets = GRENADE_MAX_RICOCHETS
        }

        throwable.ricochets += 1
      } else {
        shouldExplode = isGrenade
        throwable.life = 0
      }
    }

    if (isGrenade && throwable.contactFuse && throwable.life > 0) {
      let proximityFuseTriggered = false
      for (const unit of world.units) {
        if (unit.id === throwable.ownerId || unit.team === throwable.ownerTeam) {
          continue
        }

        const fuseRadius = unit.radius + throwable.radius + GRENADE_PROXIMITY_RADIUS
        if (
          distToSegmentSquared(
            unit.position.x,
            unit.position.y,
            previousX,
            previousY,
            throwable.position.x,
            throwable.position.y,
          ) <= fuseRadius * fuseRadius
        ) {
          proximityFuseTriggered = true
          break
        }
      }

      if (proximityFuseTriggered) {
        shouldExplode = true
        throwable.life = 0
      }
    }

    if (isGrenade) {
      for (const unit of world.units) {
        if (unit.team === throwable.ownerTeam && unit.id !== throwable.ownerId) {
          continue
        }

        const hitRadius = throwable.radius + unit.radius
        if (
          distSquared(unit.position.x, unit.position.y, throwable.position.x, throwable.position.y) <=
            hitRadius * hitRadius
        ) {
          deps.applyDamage(
            unit.id,
            GRENADE_BULLET_DAMAGE,
            throwable.ownerId,
            throwable.ownerTeam,
            unit.position.x,
            unit.position.y,
            throwable.velocity.x,
            throwable.velocity.y,
          )
          shouldExplode = true
          throwable.life = 0
          break
        }
      }
    }

    if (throwable.life > 0) {
      continue
    }

    throwable.active = false
    deps.onTrailEnd?.(
      throwable.position.x,
      throwable.position.y,
      throwable.velocity.x,
      throwable.velocity.y,
      throwable.mode,
    )
    if (isGrenade) {
      if (shouldExplode) {
        deps.explodeGrenade(throwableIndex)
        world.cameraShake = Math.min(1.4 + shakeCapBoost, world.cameraShake + GRENADE_HIT_CAMERA_SHAKE * shakeScale)
        world.hitStop = Math.max(world.hitStop, GRENADE_HIT_STOP * hitStopScale)
        deps.onExplosion()
      }

      continue
    }

    deps.igniteMolotov(throwableIndex)
    world.cameraShake = Math.min(1.15 + shakeCapBoost, world.cameraShake + 0.16 * shakeScale)
    world.hitStop = Math.max(world.hitStop, 0.006 * hitStopScale)
    deps.onExplosion()
  }
}

export interface GrenadeExplosionDeps {
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
  damageObstaclesByExplosion: (x: number, y: number, radius: number) => void
  spawnExplosion: (x: number, y: number, radius: number) => void
  applyExplosionImpulse?: (
    x: number,
    y: number,
    radius: number,
    explosivePower: number,
    sourceId: string,
    sourceTeam: Team,
  ) => void
}

export const explodeGrenade = (world: WorldState, throwableIndex: number, deps: GrenadeExplosionDeps) => {
  const throwable = world.throwables[throwableIndex]
  if (!throwable) {
    return
  }

  const explosivePower = Math.max(0.6, throwable.explosiveRadiusMultiplier)
  const explosionRadius = 3.8 * explosivePower
  const explosionRadiusSquared = explosionRadius * explosionRadius
  deps.spawnExplosion(throwable.position.x, throwable.position.y, explosionRadius)
  deps.applyExplosionImpulse?.(
    throwable.position.x,
    throwable.position.y,
    explosionRadius,
    explosivePower,
    throwable.ownerId,
    throwable.ownerTeam,
  )

  for (const unit of world.units) {
    if (unit.team === throwable.ownerTeam && unit.id !== throwable.ownerId) {
      continue
    }

    const dsq = distSquared(unit.position.x, unit.position.y, throwable.position.x, throwable.position.y)
    if (dsq > explosionRadiusSquared) {
      continue
    }

    const distance = Math.sqrt(dsq)
    const falloff = 1 - clamp(distance / explosionRadius, 0, 1)
    const damage = 3 + 5 * falloff
    deps.applyDamage(
      unit.id,
      damage,
      throwable.ownerId,
      throwable.ownerTeam,
      unit.position.x,
      unit.position.y,
      unit.position.x - throwable.position.x,
      unit.position.y - throwable.position.y,
    )
  }

  deps.damageObstaclesByExplosion(throwable.position.x, throwable.position.y, explosionRadius)
}
