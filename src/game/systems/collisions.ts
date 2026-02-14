import type { Projectile, Unit } from "../entities.ts"
import { clamp, distSquared, lerp, limitToArena } from "../utils.ts"
import {
  damageObstacleCell,
  decayObstacleFlash,
  isObstacleCellSolid,
  obstacleGridToWorldCenter,
  worldToObstacleGrid
} from "../world/obstacle-grid.ts"
import type { WorldState } from "../world/state.ts"

const resolveUnitVsRect = (unit: Unit, centerX: number, centerY: number, width: number, height: number) => {
  const halfWidth = width * 0.5
  const halfHeight = height * 0.5
  const nearestX = clamp(unit.position.x, centerX - halfWidth, centerX + halfWidth)
  const nearestY = clamp(unit.position.y, centerY - halfHeight, centerY + halfHeight)
  const dx = unit.position.x - nearestX
  const dy = unit.position.y - nearestY
  const dsq = dx * dx + dy * dy
  if (dsq >= unit.radius * unit.radius) {
    return
  }

  if (dsq <= 0.0000001) {
    const deltaX = unit.position.x - centerX
    const deltaY = unit.position.y - centerY
    const overlapX = halfWidth + unit.radius - Math.abs(deltaX)
    const overlapY = halfHeight + unit.radius - Math.abs(deltaY)

    if (overlapX < overlapY) {
      const nx = deltaX >= 0 ? 1 : -1
      unit.position.x += nx * overlapX
      unit.velocity.x += nx * overlapX * 2
      return
    }

    const ny = deltaY >= 0 ? 1 : -1
    unit.position.y += ny * overlapY
    unit.velocity.y += ny * overlapY * 2
    return
  }

  const distance = Math.sqrt(dsq)
  const push = unit.radius - distance
  const nx = dx / distance
  const ny = dy / distance
  unit.position.x += nx * push
  unit.position.y += ny * push
  unit.velocity.x += nx * push * 2
  unit.velocity.y += ny * push * 2
}

const resolveObstacleCollision = (world: WorldState, unit: Unit) => {
  const grid = world.obstacleGrid
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const min = worldToObstacleGrid(grid.size, unit.position.x - unit.radius, unit.position.y - unit.radius)
    const max = worldToObstacleGrid(grid.size, unit.position.x + unit.radius, unit.position.y + unit.radius)
    const minX = Math.max(0, min.x)
    const maxX = Math.min(grid.size - 1, max.x)
    const minY = Math.max(0, min.y)
    const maxY = Math.min(grid.size - 1, max.y)

    let pushed = false
    for (let gy = minY; gy <= maxY; gy += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
        if (!isObstacleCellSolid(grid, gx, gy)) {
          continue
        }

        const beforeX = unit.position.x
        const beforeY = unit.position.y
        const center = obstacleGridToWorldCenter(grid.size, gx, gy)
        resolveUnitVsRect(unit, center.x, center.y, 1, 1)
        if (beforeX !== unit.position.x || beforeY !== unit.position.y) {
          pushed = true
        }
      }
    }

    if (!pushed) {
      break
    }
  }
}

export const resolveUnitCollisions = (world: WorldState) => {
  for (let left = 0; left < world.units.length; left += 1) {
    const unitA = world.units[left]
    for (let right = left + 1; right < world.units.length; right += 1) {
      const unitB = world.units[right]
      const dx = unitB.position.x - unitA.position.x
      const dy = unitB.position.y - unitA.position.y
      const distance = Math.hypot(dx, dy) || 0.0001
      const minimum = unitA.radius + unitB.radius
      if (distance >= minimum) {
        continue
      }

      const overlap = (minimum - distance) * 0.5
      const nx = dx / distance
      const ny = dy / distance
      unitA.position.x -= nx * overlap
      unitA.position.y -= ny * overlap
      unitB.position.x += nx * overlap
      unitB.position.y += ny * overlap

      unitA.velocity.x -= nx * overlap * 2
      unitA.velocity.y -= ny * overlap * 2
      unitB.velocity.x += nx * overlap * 2
      unitB.velocity.y += ny * overlap * 2
    }
  }

  for (const unit of world.units) {
    resolveObstacleCollision(world, unit)
  }
}

export const constrainUnitsToArena = (world: WorldState) => {
  for (const unit of world.units) {
    limitToArena(unit.position, unit.radius, world.arenaRadius)
  }
}

export interface ObstacleDamageDeps {
  onSfxHit?: () => void
  onSfxDeath?: () => void
}

const sampleObstacleRay = (
  world: WorldState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
) => {
  const dx = toX - fromX
  const dy = toY - fromY
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 4))
  const grid = world.obstacleGrid

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const sampleX = lerp(fromX, toX, t)
    const sampleY = lerp(fromY, toY, t)
    const cell = worldToObstacleGrid(grid.size, sampleX, sampleY)
    if (!isObstacleCellSolid(grid, cell.x, cell.y)) {
      continue
    }
    return cell
  }

  return null
}

export const hitObstacle = (world: WorldState, projectile: Projectile, deps: ObstacleDamageDeps) => {
  const velocityLength = Math.hypot(projectile.velocity.x, projectile.velocity.y) || 1
  const backtrack = Math.min(0.9, velocityLength * 0.018)
  const fromX = projectile.position.x - (projectile.velocity.x / velocityLength) * backtrack
  const fromY = projectile.position.y - (projectile.velocity.y / velocityLength) * backtrack
  const hitCell = sampleObstacleRay(world, fromX, fromY, projectile.position.x, projectile.position.y)
  if (!hitCell) {
    return false
  }

  const result = damageObstacleCell(world.obstacleGrid, hitCell.x, hitCell.y, Math.max(1, projectile.damage))
  if (!result.damaged) {
    return false
  }

  deps.onSfxHit?.()
  if (result.destroyed) {
    deps.onSfxDeath?.()
  }
  return true
}

export const damageObstaclesByExplosion = (
  world: WorldState,
  x: number,
  y: number,
  radius: number,
  deps: ObstacleDamageDeps
) => {
  const grid = world.obstacleGrid
  let tookDamage = false
  let destroyedAny = false
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
      if (distSquared(center.x, center.y, x, y) > radius * radius) {
        continue
      }

      const result = damageObstacleCell(grid, gx, gy, 2.5)
      if (result.damaged) {
        tookDamage = true
        if (result.destroyed) {
          destroyedAny = true
        }
      }
    }
  }

  if (tookDamage) {
    deps.onSfxHit?.()
    if (destroyedAny) {
      deps.onSfxDeath?.()
    }
  }

  return tookDamage
}

export const updateObstacleFlash = (world: WorldState, dt: number) => {
  decayObstacleFlash(world.obstacleGrid, dt)
}
