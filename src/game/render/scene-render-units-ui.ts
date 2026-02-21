import { drawWeaponPickupSprite } from "./pixel-art.ts"
import {
  type CanvasViewportOverflowPx,
  renderOffscreenEnemyIndicators as drawOffscreenEnemyIndicators,
} from "./offscreen-indicators.ts"
import { computeHorizontalSkewX, computeWeaponKickbackDistance } from "./unit-motion-transform.ts"
import { computeDamageTakenRatio } from "./vignette.ts"
import { paletteForRagdoll, paletteForUnit } from "./scene-palette.ts"
import { clamp } from "../utils.ts"
import { type CullBounds, isInsideCullBounds } from "../cull.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"

type FogCullBounds = CullBounds

const PRIMARY_RELOAD_RING_THICKNESS_WORLD = 3 / WORLD_SCALE
const PRIMARY_RELOAD_RING_OFFSET_WORLD = 0.22
const PRIMARY_RELOAD_RING_COLOR = "#ffffff"
const PRIMARY_RELOAD_PROGRESS_RING_COLOR = "#c1c8cf"
const SECONDARY_RELOAD_RING_THICKNESS_WORLD = 2 / WORLD_SCALE
const SECONDARY_RELOAD_RING_COLOR = "#ffbf66"
const SECONDARY_RELOAD_PROGRESS_RING_COLOR = "#fff0d8"
const DAMAGE_VIGNETTE_MAX_ALPHA = 0.76
const DAMAGE_VIGNETTE_CENTER_RADIUS_RATIO = 0.26
const DAMAGE_VIGNETTE_EDGE_RADIUS_RATIO = 0.64
const DAMAGE_VIGNETTE_INTENSITY_CURVE = 0.62

const isInsideFogCullBounds = (x: number, y: number, bounds: FogCullBounds, padding = 0) => {
  return isInsideCullBounds(x, y, bounds, padding)
}

export const renderAimLasers = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  fogCullBounds: FogCullBounds,
  waveTime: number,
) => {
  const LASER_LENGTH_WORLD = 9.5
  const pulse = 0.7 + (Math.sin(waveTime * 6.5) * 0.5 + 0.5) * 0.3
  context.save()

  for (const unit of world.units) {
    const unitHasLaserSight = unit.laserSight || (unit.perkStacks.laser_sight ?? 0) > 0
    if (!unitHasLaserSight) {
      continue
    }

    if (!isInsideFogCullBounds(unit.position.x, unit.position.y, fogCullBounds, unit.radius + 10)) {
      continue
    }

    const aimLength = Math.hypot(unit.aim.x, unit.aim.y)
    if (aimLength <= 0.0001) {
      continue
    }

    const dirX = unit.aim.x / aimLength
    const dirY = unit.aim.y / aimLength
    const startX = unit.position.x + dirX * (unit.radius + 0.12)
    const startY = unit.position.y + dirY * (unit.radius + 0.12)
    const endX = startX + dirX * LASER_LENGTH_WORLD
    const endY = startY + dirY * LASER_LENGTH_WORLD
    const normalX = -dirY
    const normalY = dirX
    const halfBaseWidth = (unit.isPlayer ? 0.03 : 0.022) * pulse
    const baseLeftX = startX + normalX * halfBaseWidth
    const baseLeftY = startY + normalY * halfBaseWidth
    const baseRightX = startX - normalX * halfBaseWidth
    const baseRightY = startY - normalY * halfBaseWidth
    const alpha = unit.isPlayer ? 0.72 * pulse : 0.48 * pulse

    context.fillStyle = unit.isPlayer ? `rgba(255, 106, 106, ${alpha})` : `rgba(255, 80, 80, ${alpha})`
    context.beginPath()
    context.moveTo(baseLeftX, baseLeftY)
    context.lineTo(baseRightX, baseRightY)
    context.lineTo(endX, endY)
    context.closePath()
    context.fill()
  }

  context.restore()
}

export const renderRagdolls = (context: CanvasRenderingContext2D, world: WorldState, fogCullBounds: FogCullBounds) => {
  for (const ragdoll of world.ragdolls) {
    if (!ragdoll.active || ragdoll.maxLife <= 0) {
      continue
    }

    if (!isInsideFogCullBounds(ragdoll.position.x, ragdoll.position.y, fogCullBounds, ragdoll.radius * 2.8 + 0.75)) {
      continue
    }

    if (ragdoll.life <= 0) {
      continue
    }

    const body = ragdoll.radius * 1.2
    const palette = paletteForRagdoll(world, ragdoll)
    const tone = palette.tone
    const edge = palette.edge

    context.fillStyle = "rgba(0, 0, 0, 0.2)"
    context.beginPath()
    context.ellipse(
      ragdoll.position.x,
      ragdoll.position.y + body * 1.24,
      body * 0.58,
      body * 0.31,
      0,
      0,
      Math.PI * 2,
    )
    context.fill()

    context.save()
    context.translate(ragdoll.position.x, ragdoll.position.y)
    context.rotate(ragdoll.rotation)

    context.fillStyle = edge
    context.fillRect(-body * 0.85, -body, body * 1.7, body * 2)
    context.fillStyle = tone
    context.fillRect(-body * 0.68, -body * 0.82, body * 1.36, body * 1.64)
    context.restore()
  }
}

const renderUnitStatusRings = (
  context: CanvasRenderingContext2D,
  unit: WorldState["units"][number],
  drawX: number,
  drawY: number,
  body: number,
) => {
  const isPrimaryReloading = unit.reloadCooldown > 0 && unit.reloadCooldownMax > 0
  const primaryProgress = isPrimaryReloading
    ? clamp(1 - unit.reloadCooldown / unit.reloadCooldownMax, 0, 1)
    : Number.isFinite(unit.primaryAmmo) && Number.isFinite(unit.magazineSize) && unit.magazineSize > 0
    ? clamp(unit.primaryAmmo / unit.magazineSize, 0, 1)
    : 1
  const primaryRadius = body + PRIMARY_RELOAD_RING_OFFSET_WORLD
  const secondaryRadius = primaryRadius -
    (PRIMARY_RELOAD_RING_THICKNESS_WORLD + SECONDARY_RELOAD_RING_THICKNESS_WORLD) * 0.5
  const isSecondaryReloading = unit.secondaryCooldown > 0 && unit.secondaryCooldownMax > 0
  const secondaryProgress = isSecondaryReloading
    ? clamp(1 - unit.secondaryCooldown / unit.secondaryCooldownMax, 0, 1)
    : 1

  context.save()
  context.lineCap = "butt"
  context.beginPath()
  context.arc(drawX, drawY, primaryRadius, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * primaryProgress)
  context.strokeStyle = isPrimaryReloading ? PRIMARY_RELOAD_PROGRESS_RING_COLOR : PRIMARY_RELOAD_RING_COLOR
  context.lineWidth = PRIMARY_RELOAD_RING_THICKNESS_WORLD
  context.stroke()

  context.beginPath()
  context.arc(drawX, drawY, secondaryRadius, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * secondaryProgress)
  context.strokeStyle = isSecondaryReloading ? SECONDARY_RELOAD_PROGRESS_RING_COLOR : SECONDARY_RELOAD_RING_COLOR
  context.lineWidth = SECONDARY_RELOAD_RING_THICKNESS_WORLD
  context.stroke()

  context.restore()
}

export const renderUnits = (context: CanvasRenderingContext2D, world: WorldState, fogCullBounds: FogCullBounds) => {
  for (const unit of world.units) {
    const drawX = unit.position.x - unit.aim.x * unit.recoil * 0.32
    const drawY = unit.position.y - unit.aim.y * unit.recoil * 0.32
    const body = unit.radius * 1.2
    const ear = unit.radius * 0.42

    if (!isInsideFogCullBounds(drawX, drawY, fogCullBounds, body * 2.8)) {
      continue
    }

    renderUnitStatusRings(context, unit, drawX, drawY, body)

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
      Math.PI * 2,
    )
    context.fill()

    const palette = paletteForUnit(world, unit)
    const tone = palette.tone
    const edge = palette.edge
    const horizontalSkew = computeHorizontalSkewX(unit.velocity.x, unit.speed)
    const earLeftX = -body * 0.7
    const earRightX = body * 0.7
    const earY = -body * 0.95

    context.save()
    context.translate(drawX, drawY)
    context.transform(1, 0, horizontalSkew, 1, 0, 0)

    context.fillStyle = edge
    context.fillRect(earLeftX - ear * 0.5, earY - ear, ear, ear * 1.2)
    context.fillRect(earRightX - ear * 0.5, earY - ear, ear, ear * 1.2)
    context.fillStyle = tone
    context.fillRect(earLeftX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55)
    context.fillRect(earRightX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55)

    context.fillStyle = edge
    context.fillRect(-body * 0.85, -body, body * 1.7, body * 2)
    context.fillStyle = tone
    context.fillRect(-body * 0.68, -body * 0.82, body * 1.36, body * 1.64)

    const weaponKickback = computeWeaponKickbackDistance(
      unit.recoil,
      PRIMARY_WEAPONS[unit.primaryWeapon].firingKnockback,
      unit.radius,
    )
    const gunLength = Math.max(unit.radius * 0.42, unit.radius * 1.25 - weaponKickback)
    const weaponAngle = Math.atan2(unit.aim.y, unit.aim.x)
    const weaponScale = Math.max(0.1, unit.radius * 0.36) * 1.5
    const flipWeapon = unit.aim.x < 0
    context.save()
    if (flipWeapon) {
      context.scale(1, -1)
    }
    context.rotate(flipWeapon ? -weaponAngle : weaponAngle)
    drawWeaponPickupSprite(
      context,
      unit.primaryWeapon,
      gunLength,
      0,
      weaponScale,
      0.5,
      unit.reloadCooldown > 0 && unit.reloadCooldownMax > 0 ? "unloaded" : "default",
    )
    context.restore()

    if (unit.hitFlash > 0) {
      const flicker = 0.42 + Math.sin((1 - unit.hitFlash) * 42) * 0.38
      context.globalAlpha = clamp(unit.hitFlash * flicker, 0, 1)
      context.fillStyle = unit.isPlayer ? "#ff8a8a" : "#ff5454"
      context.fillRect(-body * 0.75, -body * 0.85, body * 1.5, body * 1.7)
      context.fillRect(earLeftX - body * 0.18, earY - body * 0.25, body * 1.36, body * 0.32)
      context.globalAlpha = 1
    }

    context.restore()

    const hpRatio = clamp(unit.hp / unit.maxHp, 0, 1)
    context.fillStyle = "rgba(0, 0, 0, 0.4)"
    context.fillRect(drawX - body, drawY - body * 1.28, body * 2, body * 0.24)
    context.fillStyle = unit.isPlayer ? "#e8ffdb" : "#8fc0ff"
    context.fillRect(drawX - body, drawY - body * 1.28, body * 2 * hpRatio, body * 0.24)
  }
}

export const renderOffscreenEnemyIndicators = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  renderCameraX: number,
  renderCameraY: number,
  viewportOverflow: CanvasViewportOverflowPx,
) => {
  drawOffscreenEnemyIndicators({
    context,
    world,
    renderCameraX,
    renderCameraY,
    viewportOverflow,
    paletteForUnit,
  })
}

export const renderDamagePopups = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  fogCullBounds: FogCullBounds,
) => {
  context.textAlign = "center"
  context.font = "0.9px monospace"
  for (const popup of world.damagePopups) {
    if (!popup.active) {
      continue
    }

    if (!isInsideFogCullBounds(popup.position.x, popup.position.y, fogCullBounds, 0.9)) {
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

export const renderAtmosphere = (context: CanvasRenderingContext2D) => {
  const gradient = context.createRadialGradient(
    VIEW_WIDTH * 0.5,
    VIEW_HEIGHT * 0.5,
    60,
    VIEW_WIDTH * 0.5,
    VIEW_HEIGHT * 0.5,
    VIEW_WIDTH * 0.75,
  )
  gradient.addColorStop(0, "rgba(212, 216, 214, 0)")
  gradient.addColorStop(1, "rgba(64, 69, 67, 0.24)")
  context.fillStyle = gradient
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
}

export const renderDamageVignette = (context: CanvasRenderingContext2D, world: WorldState) => {
  const damageRatio = computeDamageTakenRatio(world.player.hp, world.player.maxHp)
  if (damageRatio <= 0) {
    return
  }

  const intensity = damageRatio ** DAMAGE_VIGNETTE_INTENSITY_CURVE
  const alpha = intensity * DAMAGE_VIGNETTE_MAX_ALPHA
  const gradient = context.createRadialGradient(
    VIEW_WIDTH * 0.5,
    VIEW_HEIGHT * 0.5,
    Math.max(VIEW_WIDTH, VIEW_HEIGHT) * DAMAGE_VIGNETTE_CENTER_RADIUS_RATIO,
    VIEW_WIDTH * 0.5,
    VIEW_HEIGHT * 0.5,
    Math.max(VIEW_WIDTH, VIEW_HEIGHT) * DAMAGE_VIGNETTE_EDGE_RADIUS_RATIO,
  )

  gradient.addColorStop(0, "rgba(255, 0, 0, 0)")
  gradient.addColorStop(0.55, `rgba(255, 0, 0, ${alpha * 0.42})`)
  gradient.addColorStop(1, `rgba(255, 0, 0, ${alpha})`)
  context.fillStyle = gradient
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
}
