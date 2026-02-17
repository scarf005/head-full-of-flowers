import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "./world/constants.ts"

export interface CullBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export const buildCullBounds = (cameraX: number, cameraY: number, padding = 0): CullBounds => {
  const halfViewX = VIEW_WIDTH * 0.5 / WORLD_SCALE + padding
  const halfViewY = VIEW_HEIGHT * 0.5 / WORLD_SCALE + padding
  return {
    minX: cameraX - halfViewX,
    maxX: cameraX + halfViewX,
    minY: cameraY - halfViewY,
    maxY: cameraY + halfViewY,
  }
}

export const isInsideCullBounds = (x: number, y: number, bounds: CullBounds, padding = 0) => {
  return (
    x >= bounds.minX - padding &&
    x <= bounds.maxX + padding &&
    y >= bounds.minY - padding &&
    y <= bounds.maxY + padding
  )
}
