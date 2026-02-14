import type { Obstacle } from "../entities.ts"
import { clamp, distSquared, limitToArena } from "../utils.ts"
import { GRENADE_COOLDOWN, MOLOTOV_COOLDOWN } from "../weapons.ts"
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
  const speed = mode === "grenade" ? 30 : 20
  throwable.active = true
  throwable.ownerId = shooter.id
  throwable.ownerTeam = shooter.team
  throwable.mode = mode
  throwable.position.x = shooter.position.x + shooter.aim.x * (shooter.radius + 0.12)
  throwable.position.y = shooter.position.y + shooter.aim.y * (shooter.radius + 0.12)
  throwable.velocity.x = shooter.aim.x * speed
  throwable.velocity.y = shooter.aim.y * speed
  throwable.life = mode === "grenade" ? 1.05 : 0.78
  throwable.radius = mode === "grenade" ? 0.36 : 0.3

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
  breakObstacle: (obstacle: Obstacle) => void
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

    for (const obstacle of world.obstacles) {
      if (!obstacle.active) {
        continue
      }

      if (obstacle.kind === "house") {
        const originX = obstacle.position.x - obstacle.width * 0.5
        const originY = obstacle.position.y - obstacle.height * 0.5
        const tileX = Math.floor(throwable.position.x - originX)
        const tileY = Math.floor(throwable.position.y - originY)
        if (
          tileX >= 0 &&
          tileY >= 0 &&
          tileY < obstacle.tiles.length &&
          tileX < obstacle.tiles[tileY].length &&
          obstacle.tiles[tileY][tileX]
        ) {
          throwable.life = 0
          obstacle.tiles[tileY][tileX] = false
          obstacle.hp -= 1
          if (obstacle.hp <= 0) {
            deps.breakObstacle(obstacle)
          }
          break
        }
        continue
      }

      const halfWidth = obstacle.width * 0.5
      const halfHeight = obstacle.height * 0.5
      if (
        throwable.position.x >= obstacle.position.x - halfWidth &&
        throwable.position.x <= obstacle.position.x + halfWidth &&
        throwable.position.y >= obstacle.position.y - halfHeight &&
        throwable.position.y <= obstacle.position.y + halfHeight
      ) {
        throwable.life = 0
        obstacle.hp -= throwable.mode === "grenade" ? 6 : 2
        if (obstacle.hp <= 0) {
          deps.breakObstacle(obstacle)
        }
        break
      }
    }

    if (throwable.life > 0) {
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
  damageHouseByExplosion: (obstacle: Obstacle, x: number, y: number, radius: number) => void
  breakObstacle: (obstacle: Obstacle) => void
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

  for (const obstacle of world.obstacles) {
    if (!obstacle.active) {
      continue
    }

    if (obstacle.kind === "house") {
      deps.damageHouseByExplosion(obstacle, throwable.position.x, throwable.position.y, explosionRadius)
      continue
    }

    const dx = obstacle.position.x - throwable.position.x
    const dy = obstacle.position.y - throwable.position.y
    if (dx * dx + dy * dy > explosionRadiusSquared) {
      continue
    }

    obstacle.hp -= 6
    if (obstacle.hp <= 0) {
      deps.breakObstacle(obstacle)
    }
  }
}
