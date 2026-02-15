import { clamp, distSquared, limitToArena, randomRange } from "../utils.ts"
import { GRENADE_COOLDOWN, MOLOTOV_COOLDOWN } from "../weapons.ts"
import type { Team } from "../types.ts"
import { damageObstacleCell, isObstacleCellSolid, worldToObstacleGrid } from "../world/obstacle-grid.ts"
import type { WorldState } from "../world/state.ts"

const MOLOTOV_THROW_SPEED = 15
const GRENADE_BULLET_DAMAGE = 10
const GRENADE_BULLET_SPEED = 20
const GRENADE_BULLET_RANGE = 30
const GRENADE_BULLET_TTL = GRENADE_BULLET_RANGE / GRENADE_BULLET_SPEED
const GRENADE_THROW_INACCURACY_RADIANS = 0.11
const GRENADE_MAX_RICOCHETS = 2
const GRENADE_RICOCHET_RESTITUTION = 0.58
const GRENADE_RICOCHET_TANGENT_FRICTION = 0.78
const GRENADE_RICOCHET_MIN_SPEED = 2.8
const GRENADE_RICOCHET_RANDOM_RADIANS = 0.45
const GRENADE_AIR_DRAG = 0.18
const GRENADE_HIT_CAMERA_SHAKE = 0.55
const GRENADE_HIT_STOP = 0.022
const THROWABLE_SPIN_MIN = 7.2
const THROWABLE_SPIN_MAX = 18.6

export interface ThrowSecondaryDeps {
  allocThrowable: () => WorldState["throwables"][number]
  onPlayerThrow: (mode: "grenade" | "molotov") => void
  onOtherThrow: () => void
}

export const throwSecondary = (world: WorldState, shooterId: string, deps: ThrowSecondaryDeps) => {
  const shooter = world.units.find((unit) => unit.id === shooterId)
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
  const speed = mode === "grenade" ? GRENADE_BULLET_SPEED : MOLOTOV_THROW_SPEED
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
      damageObstacleCell(world.obstacleGrid, hitCell.x, hitCell.y, damage)

      if (isGrenade && throwable.ricochets < GRENADE_MAX_RICOCHETS) {
        const xCell = worldToObstacleGrid(world.obstacleGrid.size, throwable.position.x, previousY)
        const yCell = worldToObstacleGrid(world.obstacleGrid.size, previousX, throwable.position.y)
        const blockedX = isObstacleCellSolid(world.obstacleGrid, xCell.x, xCell.y)
        const blockedY = isObstacleCellSolid(world.obstacleGrid, yCell.x, yCell.y)
        const moveX = throwable.position.x - previousX
        const moveY = throwable.position.y - previousY
        const moveLength = Math.hypot(moveX, moveY) || 1
        const moveDirX = moveX / moveLength
        const moveDirY = moveY / moveLength

        throwable.position.x = previousX
        throwable.position.y = previousY

        let normalX = 0
        let normalY = 0
        if (blockedX && !blockedY) {
          normalX = moveDirX > 0 ? -1 : 1
        } else if (blockedY && !blockedX) {
          normalY = moveDirY > 0 ? -1 : 1
        } else {
          normalX = -moveDirX
          normalY = -moveDirY
        }

        const normalLength = Math.hypot(normalX, normalY) || 1
        normalX /= normalLength
        normalY /= normalLength

        const velocityDotNormal = throwable.velocity.x * normalX + throwable.velocity.y * normalY
        const normalVelocityX = velocityDotNormal * normalX
        const normalVelocityY = velocityDotNormal * normalY
        const tangentVelocityX = throwable.velocity.x - normalVelocityX
        const tangentVelocityY = throwable.velocity.y - normalVelocityY

        throwable.velocity.x = -normalVelocityX * GRENADE_RICOCHET_RESTITUTION +
          tangentVelocityX * GRENADE_RICOCHET_TANGENT_FRICTION
        throwable.velocity.y = -normalVelocityY * GRENADE_RICOCHET_RESTITUTION +
          tangentVelocityY * GRENADE_RICOCHET_TANGENT_FRICTION

        const ricochetJitter = (Math.random() * 2 - 1) * GRENADE_RICOCHET_RANDOM_RADIANS
        const jitterCos = Math.cos(ricochetJitter)
        const jitterSin = Math.sin(ricochetJitter)
        const jitteredVelocityX = throwable.velocity.x * jitterCos - throwable.velocity.y * jitterSin
        const jitteredVelocityY = throwable.velocity.x * jitterSin + throwable.velocity.y * jitterCos
        throwable.velocity.x = jitteredVelocityX
        throwable.velocity.y = jitteredVelocityY

        throwable.position.x += normalX * 0.02
        throwable.position.y += normalY * 0.02

        if (Math.hypot(throwable.velocity.x, throwable.velocity.y) < GRENADE_RICOCHET_MIN_SPEED) {
          throwable.ricochets = GRENADE_MAX_RICOCHETS
        }

        throwable.ricochets += 1
      } else {
        shouldExplode = isGrenade
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
}

export const explodeGrenade = (world: WorldState, throwableIndex: number, deps: GrenadeExplosionDeps) => {
  const throwable = world.throwables[throwableIndex]
  if (!throwable) {
    return
  }

  const explosionRadius = 3.8
  const explosionRadiusSquared = explosionRadius * explosionRadius
  deps.spawnExplosion(throwable.position.x, throwable.position.y, explosionRadius)

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
