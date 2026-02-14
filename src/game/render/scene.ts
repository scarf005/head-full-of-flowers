import { drawGrenadeSprite, drawWeaponPickupSprite } from "./pixel-art.ts"
import { clamp, randomRange } from "../utils.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import { terrainAt } from "../world/wfc-map.ts"
import type { WorldState } from "../world/state.ts"

export const botPalette = (id: string) => {
  const palettes = [
    { tone: "#7aa6ff", edge: "#3d67bf" },
    { tone: "#ff9c8e", edge: "#c95a5f" },
    { tone: "#89d7b7", edge: "#2f9b7c" },
    { tone: "#f7c276", edge: "#b88335" },
    { tone: "#c7a8ff", edge: "#7d59b7" },
    { tone: "#f3a7d8", edge: "#b36093" },
    { tone: "#9fd4ff", edge: "#4f7fa8" }
  ]

  const index = Number(id.replace("bot-", ""))
  return palettes[index % palettes.length]
}

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
      if (terrain === "dust") context.fillStyle = "#b8b290"
      if (terrain === "cracked") context.fillStyle = "#a99f7f"
      if (terrain === "dead-grass") context.fillStyle = "#98a173"
      if (terrain === "stone") context.fillStyle = "#8f9086"
      if (terrain === "rubble") context.fillStyle = "#7f7b6f"
      if (terrain === "thorns") context.fillStyle = "#646d4f"
      if (terrain === "shrub") context.fillStyle = "#7e8664"
      if (terrain === "fence") context.fillStyle = "#6c695d"
      context.fillRect(worldX, worldY, tile, tile)
      if (terrain === "dust") context.fillStyle = "#c3bb99"
      if (terrain === "cracked") context.fillStyle = "#b2a88a"
      if (terrain === "dead-grass") context.fillStyle = "#a6ad7c"
      if (terrain === "stone") context.fillStyle = "#a1a299"
      if (terrain === "rubble") context.fillStyle = "#948f84"
      if (terrain === "thorns") context.fillStyle = "#778059"
      if (terrain === "shrub") context.fillStyle = "#8e966c"
      if (terrain === "fence") context.fillStyle = "#7f7c70"
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
      drawGrenadeSprite(context, throwable.position.x, throwable.position.y, 0.08)
      continue
    }

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

    const alpha = clamp(zone.life / 2.2, 0, 1)
    context.fillStyle = `rgba(244, 120, 46, ${0.24 * alpha})`
    context.beginPath()
    context.arc(zone.position.x, zone.position.y, zone.radius, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = `rgba(255, 176, 84, ${0.5 * alpha})`
    context.lineWidth = 0.15
    context.beginPath()
    context.arc(zone.position.x, zone.position.y, Math.max(0.06, zone.radius - 0.2), 0, Math.PI * 2)
    context.stroke()
  }
}

const renderObstacles = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const obstacle of world.obstacles) {
    if (!obstacle.active) {
      continue
    }

    const halfWidth = obstacle.width * 0.5
    const halfHeight = obstacle.height * 0.5
    if (obstacle.kind === "house") {
      const originX = obstacle.position.x - halfWidth
      const originY = obstacle.position.y - halfHeight
      for (let row = 0; row < obstacle.tiles.length; row += 1) {
        for (let col = 0; col < obstacle.tiles[row].length; col += 1) {
          if (!obstacle.tiles[row][col]) {
            continue
          }

          const tileX = originX + col
          const tileY = originY + row
          context.fillStyle = "#6f7f56"
          context.fillRect(tileX, tileY, 1, 1)
          context.fillStyle = "#d7e5b6"
          context.fillRect(tileX + 0.08, tileY + 0.08, 0.84, 0.84)
        }
      }
    } else {
      context.fillStyle = "#5f6d49"
      context.fillRect(obstacle.position.x - halfWidth, obstacle.position.y - halfHeight, obstacle.width, obstacle.height)
      context.fillStyle = "#c3d7a2"
      context.fillRect(obstacle.position.x - halfWidth + 0.08, obstacle.position.y - halfHeight + 0.08, obstacle.width - 0.16, obstacle.height - 0.16)

      context.fillStyle = "#7a5a3e"
      const cuts = Math.max(2, Math.floor(obstacle.width * 2.2))
      for (let i = 0; i < cuts; i += 1) {
        const t = i / Math.max(1, cuts - 1)
        const px = obstacle.position.x - halfWidth + 0.14 + t * (obstacle.width - 0.28)
        context.fillRect(px, obstacle.position.y - halfHeight + 0.16, 0.04, obstacle.height - 0.32)
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
    const stretch = clamp(speed / 25, 1.1, 2.6)
    const length = projectile.radius * 2.6 * stretch
    const width = projectile.radius * 1.4
    const glow = projectile.radius * (2.2 + projectile.glow)

    context.fillStyle = "rgba(255, 233, 120, 0.2)"
    context.beginPath()
    context.arc(projectile.position.x, projectile.position.y, glow, 0, Math.PI * 2)
    context.fill()

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

    context.fillStyle = "rgba(0, 0, 0, 0.2)"
    context.beginPath()
    context.ellipse(drawX, drawY + body * 1.2, body * 0.72, body * 0.42, 0, 0, Math.PI * 2)
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
