import { clamp, distSquared, limitToArena } from "../utils.ts"
import { GRENADE_COOLDOWN, MOLOTOV_COOLDOWN } from "../weapons.ts"
import {
  damageObstacleCell,
  isObstacleCellSolid,
  worldToObstacleGrid
} from "../world/obstacle-grid.ts"
import type { WorldState } from "../world/state.ts"

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
  let throwDirX = shooter.aim.x
  let throwDirY = shooter.aim.y
  let throwOffset = shooter.radius + 0.12
  let speed = mode === "grenade" ? 20 : 20

  if (mode === "grenade" && shooter.isPlayer) {
    const toCursorX = world.input.worldX - shooter.position.x
    const toCursorY = world.input.worldY - shooter.position.y
    const toCursorLength = Math.hypot(toCursorX, toCursorY) || 1
    const clampedDistance = clamp(toCursorLength, 0, 14)
    const normalizedX = toCursorX / toCursorLength
    const normalizedY = toCursorY / toCursorLength
    throwOffset = Math.min(throwOffset, clampedDistance)
    throwDirX = normalizedX
    throwDirY = normalizedY
    const travelDistance = Math.max(0, clampedDistance - throwOffset)
    speed = travelDistance / 0.8
    throwable.velocity.x = normalizedX * speed
    throwable.velocity.y = normalizedY * speed
  }

  throwable.active = true
  throwable.ownerId = shooter.id
  throwable.ownerTeam = shooter.team
  throwable.mode = mode
  throwable.position.x = shooter.position.x + throwDirX * throwOffset
  throwable.position.y = shooter.position.y + throwDirY * throwOffset
  if (!(mode === "grenade" && shooter.isPlayer)) {
    throwable.velocity.x = throwDirX * speed
    throwable.velocity.y = throwDirY * speed
  }
  throwable.life = mode === "grenade" ? 1.05 : 0.78
  throwable.radius = mode === "grenade" ? 0.36 : 0.3
  throwable.rolled = mode === "grenade" && shooter.isPlayer

  const cooldown = mode === "grenade" ? GRENADE_COOLDOWN : MOLOTOV_COOLDOWN
  shooter.secondaryCooldown = cooldown * shooter.grenadeTimer
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
}

export const updateThrowables = (world: WorldState, dt: number, deps: ThrowableUpdateDeps) => {
  for (let throwableIndex = 0; throwableIndex < world.throwables.length; throwableIndex += 1) {
    const throwable = world.throwables[throwableIndex]
    if (!throwable.active) {
      continue
    }

    throwable.life -= dt
    throwable.position.x += throwable.velocity.x * dt
    throwable.position.y += throwable.velocity.y * dt
    throwable.velocity.x *= clamp(1 - dt * 0.55, 0, 1)
    throwable.velocity.y *= clamp(1 - dt * 0.55, 0, 1)
    limitToArena(throwable.position, throwable.radius, world.arenaRadius)

    const hitCell = worldToObstacleGrid(world.obstacleGrid.size, throwable.position.x, throwable.position.y)
    if (isObstacleCellSolid(world.obstacleGrid, hitCell.x, hitCell.y)) {
      const damage = throwable.mode === "grenade" ? 3 : 1.5
      damageObstacleCell(world.obstacleGrid, hitCell.x, hitCell.y, damage)
      throwable.life = 0
    }

    if (throwable.life > 0) {
      continue
    }

    if (throwable.mode === "grenade" && !throwable.rolled) {
      throwable.rolled = true
      throwable.life = 0.2
      const speed = Math.hypot(throwable.velocity.x, throwable.velocity.y)
      const directionLength = speed || 1
      throwable.velocity.x = throwable.velocity.x / directionLength * (speed + 4.5)
      throwable.velocity.y = throwable.velocity.y / directionLength * (speed + 4.5)
      continue
    }

    throwable.active = false
    if (throwable.mode === "grenade") {
      deps.explodeGrenade(throwableIndex)
    } else {
      deps.igniteMolotov(throwableIndex)
    }
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
    if (unit.id === throwable.ownerId) {
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
      unit.position.x,
      unit.position.y,
      unit.position.x - throwable.position.x,
      unit.position.y - throwable.position.y
    )
  }

  deps.damageObstaclesByExplosion(throwable.position.x, throwable.position.y, explosionRadius)
}
