import { buildCullBounds } from "../cull.ts"

export interface ObstacleGridCullRange {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export const buildObstacleGridCullRange = (
  gridSize: number,
  cameraX: number,
  cameraY: number,
  padding = 2,
): ObstacleGridCullRange => {
  const half = Math.floor(gridSize * 0.5)
  const bounds = buildCullBounds(cameraX, cameraY, padding)

  return {
    minX: Math.max(0, Math.floor(bounds.minX) + half),
    maxX: Math.min(gridSize - 1, Math.floor(bounds.maxX) + half),
    minY: Math.max(0, Math.floor(bounds.minY) + half),
    maxY: Math.min(gridSize - 1, Math.floor(bounds.maxY) + half),
  }
}
