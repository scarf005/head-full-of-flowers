import { clamp, distSquared } from "../utils.ts"
import type { WorldState } from "../world/state.ts"

export interface ProjectileDeps {
  hitObstacle: (projectileIndex: number) => boolean
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

export const updateProjectiles = (world: WorldState, dt: number, deps: ProjectileDeps) => {
  for (let projectileIndex = 0; projectileIndex < world.projectiles.length; projectileIndex += 1) {
    const projectile = world.projectiles[projectileIndex]
    if (!projectile.active) {
      continue
    }

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
      projectile.active = false
      continue
    }

    if (projectile.ttl <= 0) {
      projectile.active = false
      continue
    }

    const progress = projectile.traveled / projectile.maxRange
    if (progress > 0.62) {
      const drag = clamp(1 - dt * (5 + progress * 10), 0, 1)
      projectile.velocity.x *= drag
      projectile.velocity.y *= drag
    }

    const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
    if (progress >= 1 || (progress > 0.72 && speed < 4) || speed < 0.6) {
      projectile.active = false
      continue
    }

    if (projectile.position.length() > world.arenaRadius + 4) {
      projectile.active = false
      continue
    }

    if (deps.hitObstacle(projectileIndex)) {
      projectile.active = false
      continue
    }

    for (const unit of world.units) {
      if (unit.id === projectile.ownerId) {
        continue
      }

      const hitDistance = unit.radius + projectile.radius
      if (distSquared(unit.position.x, unit.position.y, projectile.position.x, projectile.position.y) <= hitDistance * hitDistance) {
        deps.applyDamage(
          unit.id,
          projectile.damage,
          projectile.ownerId,
          projectile.position.x,
          projectile.position.y,
          projectile.velocity.x,
          projectile.velocity.y
        )
        projectile.active = false
        break
      }
    }
  }
}
