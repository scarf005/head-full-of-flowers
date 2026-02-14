import { clamp, distSquared, limitToArena } from "../utils.ts"
import { GRENADE_COOLDOWN, MOLOTOV_COOLDOWN } from "../weapons.ts"
import {
  damageObstacleCell,
  isObstacleCellSolid,
  worldToObstacleGrid
} from "../world/obstacle-grid.ts"
import type { WorldState } from "../world/state.ts"

const MOLOTOV_THROW_SPEED = 15
const GRENADE_BULLET_DAMAGE = 10
const GRENADE_BULLET_SPEED = 20
const GRENADE_BULLET_RANGE = 30
const GRENADE_BULLET_TTL = GRENADE_BULLET_RANGE / GRENADE_BULLET_SPEED
const GRENADE_MAX_RICOCHETS = 2
const GRENADE_RICOCHET_DAMPING = 0.84
const GRENADE_RICOCHET_JITTER_RADIANS = 0.2
const GRENADE_HIT_CAMERA_SHAKE = 0.55
const GRENADE_HIT_STOP = 0.022

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
  const throwDirX = shooter.aim.x
  const throwDirY = shooter.aim.y
  const throwOffset = shooter.radius + 0.12
  const speed = mode === "grenade" ? GRENADE_BULLET_SPEED : MOLOTOV_THROW_SPEED

  throwable.active = true
  throwable.ownerId = shooter.id
  throwable.ownerTeam = shooter.team
  throwable.mode = mode
  throwable.position.x = shooter.position.x + throwDirX * throwOffset
  throwable.position.y = shooter.position.y + throwDirY * throwOffset
  throwable.velocity.x = throwDirX * speed
  throwable.velocity.y = throwDirY * speed
  throwable.life = mode === "grenade" ? GRENADE_BULLET_TTL : 0.78
  throwable.radius = mode === "grenade" ? 0.36 : 0.3
  throwable.ricochets = 0
  throwable.rolled = false

  const cooldown = mode === "grenade" ? GRENADE_COOLDOWN : MOLOTOV_COOLDOWN
  shooter.secondaryCooldown = cooldown * shooter.grenadeTimer
  shooter.secondaryCooldownMax = shooter.secondaryCooldown
  shooter.secondaryMode = mode
  shooter.recoil = Math.min(1, shooter.recoil + 0.5)

  if (shooter.isPlayer) {
    world.cameraShake = Math.min(1.1, world.cameraShake + 0.14)
    deps.onPlayerThrow(mode)
  } else if (Math.random() > 0.88) {
    deps.onOtherThrow()
  }
}

export interface ThrowableUpdateDeps {
  explodeGrenade: (throwableIndex: number) => void
  igniteMolotov: (throwableIndex: number) => void
  onExplosion: () => void
  applyDamage: (
    targetId: string,
    amount: number,
    sourceId: string,
    hitX: number,
    hitY: number,
    impactX: number,
    impactY: number
  ) => void
}

export const updateThrowables = (world: WorldState, dt: number, deps: ThrowableUpdateDeps) => {
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
    if (throwable.mode === "molotov") {
      throwable.velocity.x *= clamp(1 - dt * 0.55, 0, 1)
      throwable.velocity.y *= clamp(1 - dt * 0.55, 0, 1)
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

        throwable.position.x = previousX
        throwable.position.y = previousY

        if (blockedX || !blockedY) {
          throwable.velocity.x *= -1
        }
        if (blockedY || !blockedX) {
          throwable.velocity.y *= -1
        }

        const jitter = (Math.random() * 2 - 1) * GRENADE_RICOCHET_JITTER_RADIANS
        const cos = Math.cos(jitter)
        const sin = Math.sin(jitter)
        const ricochetX = throwable.velocity.x * cos - throwable.velocity.y * sin
        const ricochetY = throwable.velocity.x * sin + throwable.velocity.y * cos
        throwable.velocity.x = ricochetX * GRENADE_RICOCHET_DAMPING
        throwable.velocity.y = ricochetY * GRENADE_RICOCHET_DAMPING

        throwable.ricochets += 1
      } else {
        shouldExplode = isGrenade
        throwable.life = 0
      }
    }

    if (isGrenade) {
      for (const unit of world.units) {
        const hitRadius = throwable.radius + unit.radius
        if (distSquared(unit.position.x, unit.position.y, throwable.position.x, throwable.position.y) <= hitRadius * hitRadius) {
          deps.applyDamage(unit.id, GRENADE_BULLET_DAMAGE, throwable.ownerId, unit.position.x, unit.position.y, throwable.velocity.x, throwable.velocity.y)
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
    if (isGrenade) {
      if (shouldExplode) {
        deps.explodeGrenade(throwableIndex)
        world.cameraShake = Math.min(1.4, world.cameraShake + GRENADE_HIT_CAMERA_SHAKE)
        world.hitStop = Math.max(world.hitStop, GRENADE_HIT_STOP)
        deps.onExplosion()
      }

      continue
    }

    deps.igniteMolotov(throwableIndex)
    world.cameraShake = Math.min(1.15, world.cameraShake + 0.16)
    world.hitStop = Math.max(world.hitStop, 0.006)
    deps.onExplosion()
  }
}

export interface GrenadeExplosionDeps {
  applyDamage: (
    targetId: string,
    amount: number,
    sourceId: string,
    hitX: number,
    hitY: number,
    impactX: number,
    impactY: number
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
      unit.position.x,
      unit.position.y,
      unit.position.x - throwable.position.x,
      unit.position.y - throwable.position.y
    )
  }

  deps.damageObstaclesByExplosion(throwable.position.x, throwable.position.y, explosionRadius)
}
