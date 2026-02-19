import { isObstacleCellSolid, type ObstacleGridState, worldToObstacleGrid } from "../world/obstacle-grid.ts"

interface VecLike {
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
}: ApplyObstacleRicochetArgs) => {
  const xCell = worldToObstacleGrid(obstacleGrid.size, position.x, previousY)
  const yCell = worldToObstacleGrid(obstacleGrid.size, previousX, position.y)
  const blockedX = isObstacleCellSolid(obstacleGrid, xCell.x, xCell.y)
  const blockedY = isObstacleCellSolid(obstacleGrid, yCell.x, yCell.y)
  const moveX = position.x - previousX
  const moveY = position.y - previousY
  const moveLength = Math.hypot(moveX, moveY) || 1
  const moveDirX = moveX / moveLength
  const moveDirY = moveY / moveLength

  position.x = previousX
  position.y = previousY

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

  const velocityDotNormal = velocity.x * normalX + velocity.y * normalY
  const normalVelocityX = velocityDotNormal * normalX
  const normalVelocityY = velocityDotNormal * normalY
  const tangentVelocityX = velocity.x - normalVelocityX
  const tangentVelocityY = velocity.y - normalVelocityY

  velocity.x = -normalVelocityX * restitution + tangentVelocityX * tangentFriction
  velocity.y = -normalVelocityY * restitution + tangentVelocityY * tangentFriction

  const ricochetJitter = (Math.random() * 2 - 1) * jitterRadians
  const jitterCos = Math.cos(ricochetJitter)
  const jitterSin = Math.sin(ricochetJitter)
  const jitteredVelocityX = velocity.x * jitterCos - velocity.y * jitterSin
  const jitteredVelocityY = velocity.x * jitterSin + velocity.y * jitterCos
  velocity.x = jitteredVelocityX
  velocity.y = jitteredVelocityY

  position.x += normalX * separation
  position.y += normalY * separation
}
