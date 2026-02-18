import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"

const VIEW_HALF_WIDTH_WORLD = VIEW_WIDTH * 0.5 / WORLD_SCALE
const VIEW_HALF_HEIGHT_WORLD = VIEW_HEIGHT * 0.5 / WORLD_SCALE
const UNIT_BODY_RADIUS_SCALE = 1.2
const RECOIL_DRAW_OFFSET_SCALE = 0.32

export interface OffscreenIndicatorUnitLike {
  position: { x: number; y: number }
  aim: { x: number; y: number }
  recoil: number
  radius: number
}

export interface OffscreenIndicatorAnchor {
  x: number
  y: number
  extent: number
}

export const buildOffscreenIndicatorAnchor = (unit: OffscreenIndicatorUnitLike): OffscreenIndicatorAnchor => {
  return {
    x: unit.position.x - unit.aim.x * unit.recoil * RECOIL_DRAW_OFFSET_SCALE,
    y: unit.position.y - unit.aim.y * unit.recoil * RECOIL_DRAW_OFFSET_SCALE,
    extent: unit.radius * UNIT_BODY_RADIUS_SCALE,
  }
}

export const isOffscreenIndicatorAnchorInView = (
  anchor: OffscreenIndicatorAnchor,
  cameraX: number,
  cameraY: number,
) => {
  const minX = cameraX - VIEW_HALF_WIDTH_WORLD
  const maxX = cameraX + VIEW_HALF_WIDTH_WORLD
  const minY = cameraY - VIEW_HALF_HEIGHT_WORLD
  const maxY = cameraY + VIEW_HALF_HEIGHT_WORLD

  return (
    anchor.x - anchor.extent >= minX &&
    anchor.x + anchor.extent <= maxX &&
    anchor.y - anchor.extent >= minY &&
    anchor.y + anchor.extent <= maxY
  )
}
