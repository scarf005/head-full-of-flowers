import type { Obstacle, Projectile, Unit } from "../entities.ts"
import { clamp, distSquared, limitToArena } from "../utils.ts"
import type { WorldState } from "../world/state.ts"

const isTiledObstacle = (obstacle: Obstacle) => obstacle.kind === "warehouse"

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

  const distance = Math.sqrt(dsq) || 0.0001
  const push = unit.radius - distance
  const nx = dx / distance
  const ny = dy / distance
  unit.position.x += nx * push
  unit.position.y += ny * push
  unit.velocity.x += nx * push * 2
  unit.velocity.y += ny * push * 2
}

const resolveObstacleCollision = (world: WorldState, unit: Unit) => {
  for (const obstacle of world.obstacles) {
    if (!obstacle.active) {
      continue
    }

    if (isTiledObstacle(obstacle)) {
      const originX = obstacle.position.x - obstacle.width * 0.5
      const originY = obstacle.position.y - obstacle.height * 0.5
      for (let row = 0; row < obstacle.tiles.length; row += 1) {
        for (let col = 0; col < obstacle.tiles[row].length; col += 1) {
          if (!obstacle.tiles[row][col]) {
            continue
          }

          const tileCenterX = originX + col + 0.5
          const tileCenterY = originY + row + 0.5
          resolveUnitVsRect(unit, tileCenterX, tileCenterY, 1, 1)
        }
      }
      continue
    }

    resolveUnitVsRect(unit, obstacle.position.x, obstacle.position.y, obstacle.width, obstacle.height)
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

  for (const obstacle of world.obstacles) {
    if (!obstacle.active) {
      continue
    }

    const margin = Math.max(obstacle.width, obstacle.height) * 0.35
    if (obstacle.position.length() > world.arenaRadius - margin) {
      obstacle.active = false
    }
  }
}

export interface ObstacleDamageDeps {
  spawnExplosion: (x: number, y: number, radius: number) => void
  breakObstacle: (obstacle: Obstacle) => void
}

export const damageHouseByExplosion = (
  obstacle: Obstacle,
  x: number,
  y: number,
  radius: number,
  deps: ObstacleDamageDeps
) => {
  if (!isTiledObstacle(obstacle) || !obstacle.active) {
    return
  }

  const originX = obstacle.position.x - obstacle.width * 0.5
  const originY = obstacle.position.y - obstacle.height * 0.5
  for (let row = 0; row < obstacle.tiles.length; row += 1) {
    for (let col = 0; col < obstacle.tiles[row].length; col += 1) {
      if (!obstacle.tiles[row][col]) {
        continue
      }

      const tileCenterX = originX + col + 0.5
      const tileCenterY = originY + row + 0.5
      if (distSquared(tileCenterX, tileCenterY, x, y) > radius * radius) {
        continue
      }

      obstacle.hp -= 0.5
    }
  }

  if (obstacle.hp <= 0) {
    for (let row = 0; row < obstacle.tiles.length; row += 1) {
      for (let col = 0; col < obstacle.tiles[row].length; col += 1) {
        obstacle.tiles[row][col] = false
      }
    }
    deps.breakObstacle(obstacle)
  }
}

export const hitObstacle = (world: WorldState, projectile: Projectile, deps: ObstacleDamageDeps) => {
  for (const obstacle of world.obstacles) {
    if (!obstacle.active) {
      continue
    }

    if (isTiledObstacle(obstacle)) {
      const originX = obstacle.position.x - obstacle.width * 0.5
      const originY = obstacle.position.y - obstacle.height * 0.5
      const tileX = Math.floor(projectile.position.x - originX)
      const tileY = Math.floor(projectile.position.y - originY)
      if (
        tileX < 0 ||
        tileY < 0 ||
        tileY >= obstacle.tiles.length ||
        tileX >= obstacle.tiles[tileY].length ||
        !obstacle.tiles[tileY][tileX]
      ) {
        continue
      }

      obstacle.hp -= Math.max(0.08, projectile.damage * 0.1)
      deps.spawnExplosion(projectile.position.x, projectile.position.y, 0.12)
      if (obstacle.hp <= 0) {
        for (let row = 0; row < obstacle.tiles.length; row += 1) {
          for (let col = 0; col < obstacle.tiles[row].length; col += 1) {
            obstacle.tiles[row][col] = false
          }
        }
        deps.breakObstacle(obstacle)
      }
      return true
    }

    const halfWidth = obstacle.width * 0.5
    const halfHeight = obstacle.height * 0.5
    if (
      projectile.position.x < obstacle.position.x - halfWidth ||
      projectile.position.x > obstacle.position.x + halfWidth ||
      projectile.position.y < obstacle.position.y - halfHeight ||
      projectile.position.y > obstacle.position.y + halfHeight
    ) {
      continue
    }

    obstacle.hp -= Math.max(0.12, projectile.damage * 0.12)
    deps.spawnExplosion(projectile.position.x, projectile.position.y, 0.14)
    if (obstacle.hp <= 0) {
      deps.breakObstacle(obstacle)
    }
    return true
  }

  return false
}
