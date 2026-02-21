import { buildObstacleGridCullRange } from "./obstacle-cull.ts"
import { drawGrenadeSprite, drawItemPickupSprite, drawMolotovSprite } from "./pixel-art.ts"
import { clamp } from "../utils.ts"
import { type CullBounds, isInsideCullBounds } from "../cull.ts"
import {
  OBSTACLE_FLASH_BLOCKED,
  OBSTACLE_FLASH_DAMAGED,
  OBSTACLE_MATERIAL_BOX,
  OBSTACLE_MATERIAL_HEDGE,
  OBSTACLE_MATERIAL_ROCK,
  OBSTACLE_MATERIAL_WALL,
  OBSTACLE_MATERIAL_WAREHOUSE,
  obstacleGridToWorldCenter,
} from "../world/obstacle-grid.ts"
import type { WorldState } from "../world/state.ts"

type FogCullBounds = CullBounds

const isInsideFogCullBounds = (x: number, y: number, bounds: FogCullBounds, padding = 0) => {
  return isInsideCullBounds(x, y, bounds, padding)
}

const pickupGlowColor = (pickup: WorldState["pickups"][number]) => {
  if (pickup.kind === "perk") {
    return "255, 118, 118"
  }

  if (pickup.highTier) {
    return "244, 248, 255"
  }

  return "255, 214, 104"
}

export const renderPickups = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  dt: number,
  fogCullBounds: FogCullBounds,
) => {
  for (const pickup of world.pickups) {
    if (!pickup.active) {
      continue
    }

    if (!isInsideFogCullBounds(pickup.position.x, pickup.position.y, fogCullBounds, pickup.radius + 0.5)) {
      continue
    }

    const bobOffset = Math.sin(pickup.bob + dt * 4) * 0.14
    const pulse = 0.35 + (Math.sin(pickup.bob * 1.6) * 0.5 + 0.5) * 0.35
    const glow = pickupGlowColor(pickup)

    context.fillStyle = `rgba(${glow}, ${0.18 + pulse * 0.2})`
    context.beginPath()
    context.arc(pickup.position.x, pickup.position.y + bobOffset, 0.68 + pulse * 0.22, 0, Math.PI * 2)
    context.fill()

    context.strokeStyle = `rgba(${glow}, ${0.28 + pulse * 0.35})`
    context.lineWidth = 0.08
    context.beginPath()
    context.arc(pickup.position.x, pickup.position.y + bobOffset, 0.5 + pulse * 0.14, 0, Math.PI * 2)
    context.stroke()

    context.fillStyle = "rgba(0, 0, 0, 0.2)"
    context.beginPath()
    context.ellipse(pickup.position.x, pickup.position.y + 0.55, 0.45, 0.2, 0, 0, Math.PI * 2)
    context.fill()

    const spriteId = pickup.kind === "perk" && pickup.perkId ? pickup.perkId : pickup.weapon
    drawItemPickupSprite(context, spriteId, pickup.position.x, pickup.position.y + bobOffset)
  }
}

export const renderThrowables = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  renderTrails: boolean,
  fogCullBounds: FogCullBounds,
) => {
  for (const throwable of world.throwables) {
    if (!throwable.active) {
      continue
    }

    if (!isInsideFogCullBounds(throwable.position.x, throwable.position.y, fogCullBounds, throwable.radius + 0.8)) {
      continue
    }

    if (throwable.mode === "grenade") {
      const speed = Math.hypot(throwable.velocity.x, throwable.velocity.y)
      if (renderTrails && speed > 0.45) {
        const directionX = throwable.velocity.x / speed
        const directionY = throwable.velocity.y / speed
        const trailLength = clamp(speed * 0.045, 0.12, 0.58)
        for (let index = 0; index < 4; index += 1) {
          const t = index / 3
          const alpha = (1 - t) * 0.16
          const spread = 0.02 + t * 0.05
          context.fillStyle = `rgba(238, 244, 222, ${alpha})`
          context.beginPath()
          context.ellipse(
            throwable.position.x - directionX * trailLength * (0.4 + t * 0.9),
            throwable.position.y - directionY * trailLength * (0.4 + t * 0.9),
            0.09 + spread,
            0.05 + spread * 0.7,
            0,
            0,
            Math.PI * 2,
          )
          context.fill()
        }
      }

      context.fillStyle = "rgba(0, 0, 0, 0.28)"
      context.beginPath()
      context.ellipse(throwable.position.x, throwable.position.y + 0.22, 0.2, 0.11, 0, 0, Math.PI * 2)
      context.fill()

      context.save()
      context.translate(throwable.position.x, throwable.position.y)
      context.rotate(throwable.rotation)
      drawGrenadeSprite(context, 0, 0, 0.08)
      context.restore()
      continue
    }

    context.fillStyle = "rgba(0, 0, 0, 0.24)"
    context.beginPath()
    context.ellipse(throwable.position.x, throwable.position.y + 0.2, 0.18, 0.1, 0, 0, Math.PI * 2)
    context.fill()

    context.save()
    context.translate(throwable.position.x, throwable.position.y)
    context.rotate(throwable.rotation)
    drawMolotovSprite(context, 0, 0, 0.08)
    context.restore()
  }
}

export const renderMolotovZones = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  fogCullBounds: FogCullBounds,
) => {
  for (const zone of world.molotovZones) {
    if (!zone.active) {
      continue
    }

    if (!isInsideFogCullBounds(zone.position.x, zone.position.y, fogCullBounds, zone.radius + 0.5)) {
      continue
    }

    const fullLife = zone.source === "flame" ? 3 : 2.2
    const alpha = clamp(zone.life / fullLife, 0, 1)
    if (zone.source === "flame") {
      context.fillStyle = `rgba(40, 34, 27, ${0.46 * alpha})`
      context.beginPath()
      context.arc(zone.position.x, zone.position.y, zone.radius * 1.06, 0, Math.PI * 2)
      context.fill()
    }

    context.fillStyle = zone.source === "flame"
      ? `rgba(214, 108, 40, ${0.3 * alpha})`
      : `rgba(244, 120, 46, ${0.24 * alpha})`
    context.beginPath()
    context.arc(zone.position.x, zone.position.y, zone.radius, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = zone.source === "flame"
      ? `rgba(255, 193, 132, ${0.55 * alpha})`
      : `rgba(255, 176, 84, ${0.5 * alpha})`
    context.lineWidth = 0.15
    context.beginPath()
    context.arc(zone.position.x, zone.position.y, Math.max(0.06, zone.radius - 0.2), 0, Math.PI * 2)
    context.stroke()
  }
}

export const renderObstacles = (context: CanvasRenderingContext2D, world: WorldState) => {
  const grid = world.obstacleGrid
  const cullRange = buildObstacleGridCullRange(grid.size, world.camera.x, world.camera.y, 2)

  if (cullRange.maxX < cullRange.minX || cullRange.maxY < cullRange.minY) {
    return
  }

  for (let gy = cullRange.minY; gy <= cullRange.maxY; gy += 1) {
    for (let gx = cullRange.minX; gx <= cullRange.maxX; gx += 1) {
      const index = gy * grid.size + gx
      if (grid.solid[index] <= 0) {
        continue
      }

      const material = grid.material[index]
      const center = obstacleGridToWorldCenter(grid.size, gx, gy)
      const tileX = center.x - 0.5
      const tileY = center.y - 0.5

      if (material === OBSTACLE_MATERIAL_WAREHOUSE) {
        context.fillStyle = "#5f655d"
        context.fillRect(tileX, tileY, 1, 1)
        context.fillStyle = "#9ca293"
        context.fillRect(tileX + 0.08, tileY + 0.08, 0.84, 0.84)
        context.fillStyle = "#757b70"
        context.fillRect(tileX + 0.08, tileY + 0.46, 0.84, 0.12)
      } else if (material === OBSTACLE_MATERIAL_WALL) {
        context.fillStyle = "#874b39"
        context.fillRect(tileX, tileY, 1, 1)
        context.fillStyle = "#ab6850"
        context.fillRect(tileX + 0.06, tileY + 0.06, 0.88, 0.88)
        context.fillStyle = "#6e3528"
        context.fillRect(tileX + 0.06, tileY + 0.46, 0.88, 0.08)
      } else if (material === OBSTACLE_MATERIAL_BOX) {
        const isHighTierBox = grid.highTierLoot[index] > 0
        if (isHighTierBox) {
          context.fillStyle = "#4d535b"
          context.fillRect(tileX, tileY, 1, 1)
          context.fillStyle = "#d7dde6"
          context.fillRect(tileX + 0.06, tileY + 0.06, 0.88, 0.88)
          context.fillStyle = "#f4f8ff"
          context.fillRect(tileX + 0.12, tileY + 0.12, 0.76, 0.24)
          context.fillStyle = "#ffffff"
          context.fillRect(tileX + 0.44, tileY + 0.08, 0.12, 0.84)
          context.fillStyle = "#96a0ad"
          context.fillRect(tileX + 0.08, tileY + 0.54, 0.84, 0.1)
        } else {
          context.fillStyle = "#6f2d2b"
          context.fillRect(tileX, tileY, 1, 1)
          context.fillStyle = "#df6f3f"
          context.fillRect(tileX + 0.06, tileY + 0.06, 0.88, 0.88)
          context.fillStyle = "#ffd36e"
          context.fillRect(tileX + 0.12, tileY + 0.12, 0.76, 0.24)
          context.fillStyle = "#f6e5a8"
          context.fillRect(tileX + 0.44, tileY + 0.08, 0.12, 0.84)
          context.fillStyle = "#a1402e"
          context.fillRect(tileX + 0.08, tileY + 0.54, 0.84, 0.1)
        }
      } else if (material === OBSTACLE_MATERIAL_ROCK) {
        context.fillStyle = "#676a64"
        context.fillRect(tileX, tileY, 1, 1)
        context.fillStyle = "#8f948b"
        context.fillRect(tileX + 0.08, tileY + 0.08, 0.84, 0.84)
        context.fillStyle = "#5d605a"
        context.fillRect(tileX + 0.14, tileY + 0.14, 0.72, 0.08)
      } else if (material === OBSTACLE_MATERIAL_HEDGE) {
        context.fillStyle = "#496d41"
        context.fillRect(tileX, tileY, 1, 1)
        context.fillStyle = "#a9c99a"
        context.fillRect(tileX + 0.06, tileY + 0.06, 0.88, 0.88)
        context.fillStyle = "#d2e6c7"
        context.fillRect(tileX + 0.12, tileY + 0.12, 0.76, 0.2)
        context.fillStyle = "#7ea976"
        context.fillRect(tileX + 0.08, tileY + 0.56, 0.84, 0.12)
      }

      const flash = grid.flash[index]
      if (flash > 0.01) {
        const flashKind = grid.flashKind[index]
        if (flashKind === OBSTACLE_FLASH_BLOCKED) {
          const flicker = 0.4 + Math.sin((1 - flash) * 40) * 0.3
          context.fillStyle = `rgba(255, 255, 255, ${clamp(flash * flicker, 0, 1) * 0.72})`
          context.fillRect(tileX + 0.04, tileY + 0.04, 0.92, 0.92)
        } else if (flashKind === OBSTACLE_FLASH_DAMAGED) {
          const flicker = 0.6 + Math.sin((1 - flash) * 44) * 0.4
          const intensity = clamp(flash * flicker, 0, 1)
          context.fillStyle = `rgba(255, 112, 38, ${intensity * 0.95})`
          context.fillRect(tileX + 0.03, tileY + 0.03, 0.94, 0.94)
          context.fillStyle = `rgba(255, 214, 138, ${intensity * 0.5})`
          context.fillRect(tileX + 0.12, tileY + 0.12, 0.76, 0.76)
        }
      }
    }
  }
}
