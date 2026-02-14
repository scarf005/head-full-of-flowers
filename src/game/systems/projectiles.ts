import { clamp, distSquared } from "../utils.ts"
import type { WorldState } from "../world/state.ts"
import type { Team } from "../types.ts"

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

export interface ProjectileDeps {
  hitObstacle: (projectileIndex: number) => boolean
  spawnFlamePatch: (x: number, y: number, ownerId: string, ownerTeam: Team) => void
  onTrailEnd?: (
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    kind: "ballistic" | "flame",
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
  const deactivateProjectile = (projectileIndex: number, createFlamePatch: boolean) => {
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

    projectile.active = false
  }

  for (let projectileIndex = 0; projectileIndex < world.projectiles.length; projectileIndex += 1) {
    const projectile = world.projectiles[projectileIndex]
    if (!projectile.active) {
      continue
    }

    const previousX = projectile.position.x
    const previousY = projectile.position.y
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
      deactivateProjectile(projectileIndex, true)
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
      deactivateProjectile(projectileIndex, true)
      continue
    }

    if (projectile.position.length() > world.arenaRadius + 4) {
      deactivateProjectile(projectileIndex, false)
      continue
    }

    if (deps.hitObstacle(projectileIndex)) {
      deactivateProjectile(projectileIndex, true)
      continue
    }

    for (const unit of world.units) {
      if (unit.id === projectile.ownerId) {
        continue
      }

      if (unit.team === projectile.ownerTeam) {
        continue
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
        ) <= hitDistance * hitDistance
      ) {
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
        break
      }
    }
  }
}
