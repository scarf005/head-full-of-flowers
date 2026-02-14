import { drawFlameProjectileSprite, drawGrenadeSprite, drawWeaponPickupSprite } from "./pixel-art.ts"
import { clamp, randomRange } from "../utils.ts"
import { botPalette } from "../factions.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import {
  OBSTACLE_MATERIAL_ROCK,
  OBSTACLE_MATERIAL_WALL,
  OBSTACLE_MATERIAL_WAREHOUSE,
  obstacleGridToWorldCenter
} from "../world/obstacle-grid.ts"
import { terrainAt } from "../world/wfc-map.ts"
import type { WorldState } from "../world/state.ts"

export interface RenderSceneArgs {
  context: CanvasRenderingContext2D
  world: WorldState
  dt: number
}

export const renderScene = ({ context, world, dt }: RenderSceneArgs) => {
  context.save()
  context.imageSmoothingEnabled = false

  context.fillStyle = "#c6ddb7"
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)

  renderArenaGround(context, world)

  const renderCameraX = world.camera.x + world.cameraOffset.x
  const renderCameraY = world.camera.y + world.cameraOffset.y

  context.translate(VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5)
  context.scale(WORLD_SCALE, WORLD_SCALE)
  context.translate(-renderCameraX, -renderCameraY)
  renderMolotovZones(context, world)
  renderObstacles(context, world)
  renderFlowers(context, world)
  renderPickups(context, world, dt)
  renderThrowables(context, world)
  renderProjectiles(context, world)
  renderUnits(context, world)
  renderExplosions(context, world)
  renderDamagePopups(context, world)
  renderArenaBoundary(context, world)
  context.restore()

  renderOffscreenEnemyIndicators(context, world, renderCameraX, renderCameraY)
  renderAtmosphere(context)
  renderMenuCard(context, world)
}

const renderArenaGround = (context: CanvasRenderingContext2D, world: WorldState) => {
  context.save()
  context.translate(VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5)
  context.scale(WORLD_SCALE, WORLD_SCALE)
  context.translate(-world.camera.x, -world.camera.y)

  context.fillStyle = "#a3c784"
  context.beginPath()
  context.arc(0, 0, world.arenaRadius, 0, Math.PI * 2)
  context.fill()

  context.save()
  context.beginPath()
  context.arc(0, 0, world.arenaRadius - 0.12, 0, Math.PI * 2)
  context.clip()

  const tile = 1
  const halfViewX = VIEW_WIDTH * 0.5 / WORLD_SCALE
  const halfViewY = VIEW_HEIGHT * 0.5 / WORLD_SCALE
  const minX = Math.floor((world.camera.x - halfViewX) / tile) - 2
  const maxX = Math.floor((world.camera.x + halfViewX) / tile) + 2
  const minY = Math.floor((world.camera.y - halfViewY) / tile) - 2
  const maxY = Math.floor((world.camera.y + halfViewY) / tile) + 2

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const worldX = x * tile
      const worldY = y * tile
      if (worldX * worldX + worldY * worldY > world.arenaRadius * world.arenaRadius) {
        continue
      }

      const terrain = terrainAt(world.terrainMap, worldX, worldY)
      if (terrain === "grass") context.fillStyle = "#82957e"
      if (terrain === "clover") context.fillStyle = "#798d76"
      if (terrain === "wild-grass") context.fillStyle = "#72876f"
      if (terrain === "dirt") context.fillStyle = "#8a7f70"
      if (terrain === "dirt-road") context.fillStyle = "#7f7568"
      if (terrain === "road-edge") context.fillStyle = "#7f8b78"
      if (terrain === "gravel") context.fillStyle = "#8a887f"
      if (terrain === "concrete") context.fillStyle = "#94968f"
      context.fillRect(worldX, worldY, tile, tile)
      if (terrain === "grass") context.fillStyle = "#90a48b"
      if (terrain === "clover") context.fillStyle = "#879c84"
      if (terrain === "wild-grass") context.fillStyle = "#80967e"
      if (terrain === "dirt") context.fillStyle = "#988c7c"
      if (terrain === "dirt-road") context.fillStyle = "#8d8173"
      if (terrain === "road-edge") context.fillStyle = "#8d9b86"
      if (terrain === "gravel") context.fillStyle = "#9a978d"
      if (terrain === "concrete") context.fillStyle = "#a4a69f"
      context.fillRect(worldX + 0.05, worldY + 0.05, tile - 0.18, tile - 0.18)
    }
  }

  context.restore()
  context.restore()
}

const renderArenaBoundary = (context: CanvasRenderingContext2D, world: WorldState) => {
  context.strokeStyle = "#cfe6bc"
  context.lineWidth = 0.45
  context.beginPath()
  context.arc(0, 0, world.arenaRadius, 0, Math.PI * 2)
  context.stroke()

  context.strokeStyle = "#84af63"
  context.lineWidth = 0.2
  context.beginPath()
  context.arc(0, 0, world.arenaRadius - 0.5, 0, Math.PI * 2)
  context.stroke()
}

const renderFlowers = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const flower of world.flowers) {
    if (!flower.active) {
      continue
    }

    const size = Math.max(0.05, flower.size)
    const petal = size
    const center = size * 0.5
    context.fillStyle = flower.color
    context.fillRect(flower.position.x - petal, flower.position.y - center, petal * 2, center * 2)
    context.fillRect(flower.position.x - center, flower.position.y - petal, center * 2, petal * 2)
    context.fillStyle = flower.accent
    context.fillRect(flower.position.x - 0.04, flower.position.y - 0.04, 0.08, 0.08)
  }
}

const renderPickups = (context: CanvasRenderingContext2D, world: WorldState, dt: number) => {
  for (const pickup of world.pickups) {
    if (!pickup.active) {
      continue
    }

    const bobOffset = Math.sin(pickup.bob + dt * 4) * 0.14
    context.fillStyle = "rgba(0, 0, 0, 0.2)"
    context.beginPath()
    context.ellipse(pickup.position.x, pickup.position.y + 0.55, 0.45, 0.2, 0, 0, Math.PI * 2)
    context.fill()

    drawWeaponPickupSprite(context, pickup.weapon, pickup.position.x, pickup.position.y + bobOffset, 0.1)
  }
}

const renderThrowables = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const throwable of world.throwables) {
    if (!throwable.active) {
      continue
    }

    if (throwable.mode === "grenade") {
      const speed = Math.hypot(throwable.velocity.x, throwable.velocity.y)
      if (speed > 0.45) {
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
            Math.PI * 2
          )
          context.fill()
        }
      }

      context.fillStyle = "rgba(0, 0, 0, 0.28)"
      context.beginPath()
      context.ellipse(throwable.position.x, throwable.position.y + 0.22, 0.2, 0.11, 0, 0, Math.PI * 2)
      context.fill()
      drawGrenadeSprite(context, throwable.position.x, throwable.position.y, 0.08)
      continue
    }

    context.fillStyle = "rgba(0, 0, 0, 0.24)"
    context.beginPath()
    context.ellipse(throwable.position.x, throwable.position.y + 0.2, 0.18, 0.1, 0, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = "#8f3a2e"
    context.fillRect(throwable.position.x - 0.12, throwable.position.y - 0.12, 0.24, 0.24)
    context.fillStyle = "#f88a3a"
    context.fillRect(throwable.position.x - 0.08, throwable.position.y - 0.08, 0.16, 0.16)
  }
}

const renderMolotovZones = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const zone of world.molotovZones) {
    if (!zone.active) {
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

const renderObstacles = (context: CanvasRenderingContext2D, world: WorldState) => {
  const grid = world.obstacleGrid
  const half = Math.floor(grid.size * 0.5)
  const halfViewX = VIEW_WIDTH * 0.5 / WORLD_SCALE
  const halfViewY = VIEW_HEIGHT * 0.5 / WORLD_SCALE
  const minX = Math.max(0, Math.floor(world.camera.x - halfViewX) + half - 2)
  const maxX = Math.min(grid.size - 1, Math.floor(world.camera.x + halfViewX) + half + 2)
  const minY = Math.max(0, Math.floor(world.camera.y - halfViewY) + half - 2)
  const maxY = Math.min(grid.size - 1, Math.floor(world.camera.y + halfViewY) + half + 2)

  for (let gy = minY; gy <= maxY; gy += 1) {
    for (let gx = minX; gx <= maxX; gx += 1) {
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
      } else if (material === OBSTACLE_MATERIAL_ROCK) {
        context.fillStyle = "#676a64"
        context.fillRect(tileX, tileY, 1, 1)
        context.fillStyle = "#8f948b"
        context.fillRect(tileX + 0.08, tileY + 0.08, 0.84, 0.84)
        context.fillStyle = "#5d605a"
        context.fillRect(tileX + 0.14, tileY + 0.14, 0.72, 0.08)
      }

      const flash = grid.flash[index]
      if (flash > 0.01) {
        const flicker = 0.42 + Math.sin((1 - flash) * 42) * 0.38
        context.fillStyle = `rgba(255, 96, 96, ${clamp(flash * flicker, 0, 1) * 0.55})`
        context.fillRect(tileX + 0.04, tileY + 0.04, 0.92, 0.92)
      }
    }
  }
}

const renderExplosions = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const explosion of world.explosions) {
    if (!explosion.active) {
      continue
    }

    const alpha = clamp(explosion.life / 0.24, 0, 1)
    const radius = explosion.radius * (1 + (1 - alpha) * 0.45)
    if (explosion.radius <= 0.18) {
      const pulse = 1 + (1 - alpha) * 0.25
      context.fillStyle = `rgba(255, 86, 86, ${0.62 * alpha})`
      context.fillRect(
        explosion.position.x - explosion.radius * pulse,
        explosion.position.y - explosion.radius * pulse,
        explosion.radius * 2 * pulse,
        explosion.radius * 2 * pulse
      )
      continue
    }

    context.fillStyle = `rgba(255, 192, 74, ${0.24 * alpha})`
    context.beginPath()
    context.arc(explosion.position.x, explosion.position.y, radius, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = `rgba(255, 132, 56, ${0.72 * alpha})`
    for (let i = 0; i < 10; i += 1) {
      const angle = (Math.PI * 2 * i) / 10 + (1 - alpha) * 0.8
      const spike = radius * randomRange(0.16, 1)
      context.fillRect(
        explosion.position.x + Math.cos(angle) * spike - 0.08,
        explosion.position.y + Math.sin(angle) * spike - 0.08,
        0.16,
        0.16
      )
    }
  }
}

const renderProjectiles = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const projectile of world.projectiles) {
    if (!projectile.active) {
      continue
    }

    const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
    const angle = Math.atan2(projectile.velocity.y, projectile.velocity.x)
    const stretch = clamp(speed / 25, 1.1, projectile.kind === "flame" ? 2.2 : 2.9)
    const length = projectile.radius * 2.6 * stretch
    const width = projectile.radius * 1.4
    const glow = projectile.radius * (2.2 + projectile.glow)

    context.fillStyle = "rgba(0, 0, 0, 0.26)"
    context.beginPath()
    context.ellipse(projectile.position.x, projectile.position.y + 0.26, projectile.radius * 0.8, projectile.radius * 0.45, 0, 0, Math.PI * 2)
    context.fill()

    const glowColor = projectile.kind === "flame"
      ? "rgba(255, 148, 72, 0.36)"
      : "rgba(255, 244, 176, 0.34)"
    context.fillStyle = glowColor
    context.beginPath()
    context.arc(projectile.position.x, projectile.position.y, glow, 0, Math.PI * 2)
    context.fill()

    context.save()
    context.translate(projectile.position.x, projectile.position.y)
    context.rotate(angle)

    const trailLength = projectile.kind === "flame" ? length * 1.1 : length * 1.65
    for (let index = 0; index < 6; index += 1) {
      const t = index / 5
      const alpha = projectile.kind === "flame"
        ? (1 - t) * 0.2
        : (1 - t) * 0.22
      context.fillStyle = projectile.kind === "flame"
        ? `rgba(255, 177, 122, ${alpha})`
        : `rgba(255, 230, 170, ${alpha})`
      context.beginPath()
      context.ellipse(
        -trailLength * (0.3 + t * 0.58),
        0,
        width * (0.9 - t * 0.36),
        width * (0.56 - t * 0.24),
        0,
        0,
        Math.PI * 2
      )
      context.fill()
    }

    context.restore()

    if (projectile.kind === "flame") {
      drawFlameProjectileSprite(context, projectile.position.x, projectile.position.y, 0.07)
      continue
    }

    context.save()
    context.translate(projectile.position.x, projectile.position.y)
    context.rotate(angle)

    context.fillStyle = "rgba(255, 181, 72, 0.35)"
    context.beginPath()
    context.ellipse(-length * 0.2, 0, length * 0.55, width * 0.86, 0, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = "#ffc248"
    context.beginPath()
    context.moveTo(-length * 0.52, 0)
    context.quadraticCurveTo(-length * 0.2, -width * 0.65, length * 0.45, 0)
    context.quadraticCurveTo(-length * 0.2, width * 0.65, -length * 0.52, 0)
    context.fill()

    context.fillStyle = "#fff2aa"
    context.beginPath()
    context.ellipse(length * 0.18, 0, width * 0.4, width * 0.3, 0, 0, Math.PI * 2)
    context.fill()

    context.restore()
  }
}

const renderUnits = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const unit of world.units) {
    const drawX = unit.position.x - unit.aim.x * unit.recoil * 0.32
    const drawY = unit.position.y - unit.aim.y * unit.recoil * 0.32
    const body = unit.radius * 1.2
    const ear = unit.radius * 0.42

    const moveSpeed = Math.hypot(unit.velocity.x, unit.velocity.y)
    const skew = clamp(moveSpeed / 12, 0, 1)
    context.fillStyle = "rgba(0, 0, 0, 0.24)"
    context.beginPath()
    context.ellipse(
      drawX - unit.velocity.x * 0.012,
      drawY + body * 1.26,
      body * (0.68 + skew * 0.12),
      body * (0.37 - skew * 0.05),
      0,
      0,
      Math.PI * 2
    )
    context.fill()

    const palette = unit.isPlayer ? { tone: "#f6f2df", edge: "#b8b49a" } : botPalette(unit.id)
    const tone = palette.tone
    const edge = palette.edge
    const earLeftX = drawX - body * 0.7
    const earRightX = drawX + body * 0.7
    const earY = drawY - body * 0.95

    context.fillStyle = edge
    context.fillRect(earLeftX - ear * 0.5, earY - ear, ear, ear * 1.2)
    context.fillRect(earRightX - ear * 0.5, earY - ear, ear, ear * 1.2)
    context.fillStyle = tone
    context.fillRect(earLeftX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55)
    context.fillRect(earRightX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55)

    context.fillStyle = edge
    context.fillRect(drawX - body * 0.85, drawY - body, body * 1.7, body * 2)
    context.fillStyle = tone
    context.fillRect(drawX - body * 0.68, drawY - body * 0.82, body * 1.36, body * 1.64)

    const gunLength = unit.radius * 1.25 + unit.recoil * 0.24
    const gunX = drawX + unit.aim.x * gunLength
    const gunY = drawY + unit.aim.y * gunLength
    context.strokeStyle = unit.isPlayer ? "#f0e6ad" : "#a2d0ff"
    context.lineWidth = 0.24
    context.beginPath()
    context.moveTo(drawX, drawY)
    context.lineTo(gunX, gunY)
    context.stroke()

    if (unit.hitFlash > 0) {
      const flicker = 0.42 + Math.sin((1 - unit.hitFlash) * 42) * 0.38
      context.globalAlpha = clamp(unit.hitFlash * flicker, 0, 1)
      context.fillStyle = unit.isPlayer ? "#ff8a8a" : "#ff5454"
      context.fillRect(drawX - body * 0.75, drawY - body * 0.85, body * 1.5, body * 1.7)
      context.fillRect(earLeftX - body * 0.18, earY - body * 0.25, body * 1.36, body * 0.32)
      context.globalAlpha = 1
    }

    const hpRatio = clamp(unit.hp / unit.maxHp, 0, 1)
    context.fillStyle = "rgba(0, 0, 0, 0.4)"
    context.fillRect(drawX - body, drawY - body * 1.28, body * 2, body * 0.24)
    context.fillStyle = unit.isPlayer ? "#e8ffdb" : "#8fc0ff"
    context.fillRect(drawX - body, drawY - body * 1.28, body * 2 * hpRatio, body * 0.24)
  }
}

const renderOffscreenEnemyIndicators = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  renderCameraX: number,
  renderCameraY: number
) => {
  if (!world.running || world.finished) {
    return
  }

  const margin = 24
  const innerLeft = margin
  const innerTop = margin
  const innerRight = VIEW_WIDTH - margin
  const innerBottom = VIEW_HEIGHT - margin
  const centerX = VIEW_WIDTH * 0.5
  const centerY = VIEW_HEIGHT * 0.5

  context.save()
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.font = "bold 11px monospace"

  for (const enemy of world.bots) {
    const screenX = (enemy.position.x - renderCameraX) * WORLD_SCALE + centerX
    const screenY = (enemy.position.y - renderCameraY) * WORLD_SCALE + centerY
    const isOnScreen = screenX >= innerLeft && screenX <= innerRight && screenY >= innerTop && screenY <= innerBottom
    if (isOnScreen) {
      continue
    }

    const dx = screenX - centerX
    const dy = screenY - centerY
    const angle = Math.atan2(dy, dx)
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const edgeScaleX = (VIEW_WIDTH * 0.5 - margin) / Math.max(0.001, Math.abs(cosine))
    const edgeScaleY = (VIEW_HEIGHT * 0.5 - margin) / Math.max(0.001, Math.abs(sine))
    const edgeDistance = Math.min(edgeScaleX, edgeScaleY)
    const markerX = centerX + cosine * edgeDistance
    const markerY = centerY + sine * edgeDistance
    const distanceMeters = Math.hypot(enemy.position.x - world.player.position.x, enemy.position.y - world.player.position.y)
    const palette = botPalette(enemy.id)

    context.save()
    context.translate(markerX, markerY)
    context.rotate(angle)

    context.fillStyle = "rgba(0, 0, 0, 0.4)"
    context.beginPath()
    context.moveTo(13, 0)
    context.lineTo(-2, -8)
    context.lineTo(-2, 8)
    context.closePath()
    context.fill()

    context.fillStyle = palette.tone
    context.beginPath()
    context.moveTo(11, 0)
    context.lineTo(-3, -7)
    context.lineTo(-3, 7)
    context.closePath()
    context.fill()

    context.fillStyle = palette.edge
    context.fillRect(-17, -5, 8, 8)
    context.fillStyle = "#eff3ff"
    context.fillRect(-15, -3, 4, 4)

    context.rotate(-angle)
    context.fillStyle = "rgba(8, 16, 10, 0.72)"
    context.fillRect(-7, 9, 30, 14)
    context.fillStyle = "#eaf5e1"
    context.fillText(`${distanceMeters.toFixed(1)}m`, 8, 16)
    context.restore()
  }

  context.restore()
}

const renderDamagePopups = (context: CanvasRenderingContext2D, world: WorldState) => {
  context.textAlign = "center"
  context.font = "0.9px monospace"
  for (const popup of world.damagePopups) {
    if (!popup.active) {
      continue
    }

    const alpha = clamp(popup.life / 0.62, 0, 1)
    const scale = 1 + (1 - alpha) * 0.14
    context.fillStyle = `rgba(0, 0, 0, ${0.5 * alpha})`
    context.fillText(popup.text, popup.position.x + 0.05, popup.position.y + 0.05)

    context.save()
    context.globalAlpha = alpha
    context.fillStyle = popup.color
    context.translate(popup.position.x, popup.position.y)
    context.scale(scale, scale)
    context.fillText(popup.text, 0, 0)
    context.restore()
  }
}

const renderAtmosphere = (context: CanvasRenderingContext2D) => {
  const gradient = context.createRadialGradient(
    VIEW_WIDTH * 0.5,
    VIEW_HEIGHT * 0.5,
    60,
    VIEW_WIDTH * 0.5,
    VIEW_HEIGHT * 0.5,
    VIEW_WIDTH * 0.75
  )
  gradient.addColorStop(0, "rgba(210, 236, 196, 0)")
  gradient.addColorStop(1, "rgba(133, 168, 120, 0.28)")
  context.fillStyle = gradient
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
}

const renderMenuCard = (context: CanvasRenderingContext2D, world: WorldState) => {
  if (world.started && !world.finished) {
    return
  }

  context.fillStyle = "rgba(20, 36, 22, 0.56)"
  context.fillRect(VIEW_WIDTH * 0.5 - 220, VIEW_HEIGHT * 0.5 - 60, 440, 120)
  context.strokeStyle = "#d6eaba"
  context.lineWidth = 2
  context.strokeRect(VIEW_WIDTH * 0.5 - 220, VIEW_HEIGHT * 0.5 - 60, 440, 120)

  context.textAlign = "center"
  context.fillStyle = "#edf7da"
  context.font = "bold 24px monospace"
  context.fillText("BadaBada", VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5 - 14)
  context.font = "14px monospace"
  const startHint = world.audioPrimed
    ? "Click or press Enter to start 50m shrinking arena"
    : "Click once to unlock music, then deploy"
  context.fillText(startHint, VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5 + 16)
  if (world.finished) {
    context.fillText("Match over. Click for rematch", VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5 + 38)
  }
}
