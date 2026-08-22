import { isObstacleCellSolid, type ObstacleGridState, worldToObstacleGrid } from "../world/obstacle-grid.ts"
import { randomFloat } from "../replay.ts"

interface VecLike {
  x: number
  y: number
}

export interface ObstacleRicochetImpact {
  normalX: number
  normalY: number
  x: number
  y: number
}

interface ApplyObstacleRicochetArgs {
  obstacleGrid: ObstacleGridState
  previousX: number
  previousY: number
  position: VecLike
  velocity: VecLike
  restitution: number
  tangentFriction: number
  jitterRadians: number
  separation: number
  impact?: ObstacleRicochetImpact | null
}

export const findObstacleRicochetImpact = (
  obstacleGrid: ObstacleGridState,
  previousX: number,
  previousY: number,
  position: VecLike,
): ObstacleRicochetImpact | null => {
  const moveX = position.x - previousX
  const moveY = position.y - previousY
  const stepX = Math.sign(moveX)
  const stepY = Math.sign(moveY)
  if (stepX === 0 && stepY === 0) {
    return null
  }

  let cell = worldToObstacleGrid(obstacleGrid.size, previousX, previousY)
  if (isObstacleCellSolid(obstacleGrid, cell.x, cell.y)) {
    return null
  }

  const half = Math.floor(obstacleGrid.size * 0.5)
  const xBoundary = stepX > 0 ? cell.x - half + 1 : cell.x - half
  const yBoundary = stepY > 0 ? cell.y - half + 1 : cell.y - half
  let tMaxX = stepX === 0 ? Number.POSITIVE_INFINITY : (xBoundary - previousX) / moveX
  let tMaxY = stepY === 0 ? Number.POSITIVE_INFINITY : (yBoundary - previousY) / moveY
  const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(moveX)
  const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : 1 / Math.abs(moveY)

  while (Math.min(tMaxX, tMaxY) <= 1) {
    const hitX = Math.min(tMaxX, tMaxY)
    const crossesX = Math.abs(tMaxX - hitX) <= 0.0000001
    const crossesY = Math.abs(tMaxY - hitX) <= 0.0000001
    const nextXCell = cell.x + (crossesX ? stepX : 0)
    const nextYCell = cell.y + (crossesY ? stepY : 0)

    if (isObstacleCellSolid(obstacleGrid, nextXCell, nextYCell)) {
      const normalX = crossesX ? -stepX : 0
      const normalY = crossesY ? -stepY : 0
      const normalLength = Math.hypot(normalX, normalY)
      return {
        normalX: normalX / normalLength,
        normalY: normalY / normalLength,
        x: previousX + moveX * hitX,
        y: previousY + moveY * hitX,
      }
    }

    cell = { x: nextXCell, y: nextYCell }
    if (crossesX) {
      tMaxX += tDeltaX
    }
    if (crossesY) {
      tMaxY += tDeltaY
    }
  }

  return null
}

export const applyObstacleRicochet = ({
  obstacleGrid,
  previousX,
  previousY,
  position,
  velocity,
  restitution,
  tangentFriction,
  jitterRadians,
  separation,
  impact = findObstacleRicochetImpact(obstacleGrid, previousX, previousY, position),
}: ApplyObstacleRicochetArgs) => {
  const moveX = position.x - previousX
  const moveY = position.y - previousY
  const moveLength = Math.hypot(moveX, moveY) || 1
  const moveDirX = moveX / moveLength
  const moveDirY = moveY / moveLength
  const normalX = impact?.normalX ?? -moveDirX
  const normalY = impact?.normalY ?? -moveDirY

  position.x = impact?.x ?? previousX
  position.y = impact?.y ?? previousY

  const velocityDotNormal = velocity.x * normalX + velocity.y * normalY
  const normalVelocityX = velocityDotNormal * normalX
  const normalVelocityY = velocityDotNormal * normalY
  const tangentVelocityX = velocity.x - normalVelocityX
  const tangentVelocityY = velocity.y - normalVelocityY

  velocity.x = -normalVelocityX * restitution + tangentVelocityX * tangentFriction
  velocity.y = -normalVelocityY * restitution + tangentVelocityY * tangentFriction

  const ricochetJitter = (randomFloat() * 2 - 1) * jitterRadians
  const jitterCos = Math.cos(ricochetJitter)
  const jitterSin = Math.sin(ricochetJitter)
  const jitteredVelocityX = velocity.x * jitterCos - velocity.y * jitterSin
  const jitteredVelocityY = velocity.x * jitterSin + velocity.y * jitterCos
  velocity.x = jitteredVelocityX
  velocity.y = jitteredVelocityY

  position.x += normalX * separation
  position.y += normalY * separation
}
