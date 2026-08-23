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
const SECONDARY_RELOAD_RING_THICKNESS_WORLD = 2 / WORLD_SCALE
const DAMAGE_VIGNETTE_MAX_ALPHA = 0.76
const DAMAGE_VIGNETTE_INTENSITY_CURVE = 0.62

const isInsideFogCullBounds = (x: number, y: number, bounds: FogCullBounds, padding = 0) =>
  isInsideCullBounds(x, y, bounds, padding)

export const renderAimLasers = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  fogCullBounds: FogCullBounds,
  waveTime: number,
) => {
  const laserLength = 9.5
  const pulse = 0.7 + (Math.sin(waveTime * 6.5) * 0.5 + 0.5) * 0.3
  for (const unit of world.units) {
    const hasLaser = unit.laserSight || (unit.perkStacks.laser_sight ?? 0) > 0
    if (!hasLaser || !isInsideFogCullBounds(unit.position.x, unit.position.y, fogCullBounds, unit.radius + 10)) continue
    const aimLength = Math.hypot(unit.aim.x, unit.aim.y)
    if (aimLength <= 0.0001) continue
    const dx = unit.aim.x / aimLength
    const dy = unit.aim.y / aimLength
    const startX = unit.position.x + dx * (unit.radius + 0.12)
    const startY = unit.position.y + dy * (unit.radius + 0.12)
    const endX = startX + dx * laserLength
    const endY = startY + dy * laserLength
    const nx = -dy
    const ny = dx
    const halfWidth = (unit.isPlayer ? 0.03 : 0.022) * pulse
    context.fillStyle = unit.isPlayer ? `rgba(255, 106, 106, ${0.72 * pulse})` : `rgba(255, 80, 80, ${0.48 * pulse})`
    context.beginPath()
    context.moveTo(startX + nx * halfWidth, startY + ny * halfWidth)
    context.lineTo(startX - nx * halfWidth, startY - ny * halfWidth)
    context.lineTo(endX, endY)
    context.closePath()
    context.fill()
  }
}

export const renderRagdolls = (context: CanvasRenderingContext2D, world: WorldState, fogCullBounds: FogCullBounds) => {
  for (const ragdoll of world.ragdolls) {
    if (!ragdoll.active || ragdoll.maxLife <= 0 || ragdoll.life <= 0) continue
    if (!isInsideFogCullBounds(ragdoll.position.x, ragdoll.position.y, fogCullBounds, ragdoll.radius * 2.8 + 0.75)) {
      continue
    }
    const body = ragdoll.radius * 1.2
    const palette = paletteForRagdoll(world, ragdoll)
    context.fillStyle = "rgba(0, 0, 0, 0.2)"
    context.beginPath()
    context.ellipse(ragdoll.position.x, ragdoll.position.y + body * 1.24, body * 0.58, body * 0.31, 0, 0, Math.PI * 2)
    context.fill()
    context.save()
    context.translate(ragdoll.position.x, ragdoll.position.y)
    context.rotate(ragdoll.rotation)
    context.fillStyle = palette.edge
    context.fillRect(-body * 0.85, -body, body * 1.7, body * 2)
    context.fillStyle = palette.tone
    context.fillRect(-body * 0.68, -body * 0.82, body * 1.36, body * 1.64)
    context.restore()
  }
}

const renderUnitStatusRings = (
  context: CanvasRenderingContext2D,
  unit: WorldState["units"][number],
  x: number,
  y: number,
  body: number,
) => {
  const primaryReloading = unit.reloadCooldown > 0 && unit.reloadCooldownMax > 0
  const primaryProgress = primaryReloading
    ? clamp(1 - unit.reloadCooldown / unit.reloadCooldownMax, 0, 1)
    : Number.isFinite(unit.primaryAmmo) && Number.isFinite(unit.magazineSize) && unit.magazineSize > 0
    ? clamp(unit.primaryAmmo / unit.magazineSize, 0, 1)
    : 1
  const primaryRadius = body + PRIMARY_RELOAD_RING_OFFSET_WORLD
  const secondaryRadius = primaryRadius -
    (PRIMARY_RELOAD_RING_THICKNESS_WORLD + SECONDARY_RELOAD_RING_THICKNESS_WORLD) * 0.5
  const secondaryReloading = unit.secondaryCooldown > 0 && unit.secondaryCooldownMax > 0
  const secondaryProgress = secondaryReloading ? clamp(1 - unit.secondaryCooldown / unit.secondaryCooldownMax, 0, 1) : 1

  context.lineCap = "butt"
  context.beginPath()
  context.arc(x, y, primaryRadius, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * primaryProgress)
  context.strokeStyle = primaryReloading ? "#c1c8cf" : "#ffffff"
  context.lineWidth = PRIMARY_RELOAD_RING_THICKNESS_WORLD
  context.stroke()
  context.beginPath()
  context.arc(x, y, secondaryRadius, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * secondaryProgress)
  context.strokeStyle = secondaryReloading ? "#fff0d8" : "#ffbf66"
  context.lineWidth = SECONDARY_RELOAD_RING_THICKNESS_WORLD
  context.stroke()
}

export const renderUnits = (context: CanvasRenderingContext2D, world: WorldState, fogCullBounds: FogCullBounds) => {
  for (const unit of world.units) {
    const drawX = unit.position.x - unit.aim.x * unit.recoil * 0.32
    const drawY = unit.position.y - unit.aim.y * unit.recoil * 0.32
    const body = unit.radius * 1.2
    const ear = unit.radius * 0.42
    if (!isInsideFogCullBounds(drawX, drawY, fogCullBounds, body * 2.8)) continue

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
    const horizontalSkew = computeHorizontalSkewX(unit.velocity.x, unit.speed)
    const earLeftX = -body * 0.7
    const earRightX = body * 0.7
    const earY = -body * 0.95
    context.save()
    context.translate(drawX, drawY)
    context.transform(1, 0, horizontalSkew, 1, 0, 0)
    context.fillStyle = palette.edge
    context.fillRect(earLeftX - ear * 0.5, earY - ear, ear, ear * 1.2)
    context.fillRect(earRightX - ear * 0.5, earY - ear, ear, ear * 1.2)
    context.fillStyle = palette.tone
    context.fillRect(earLeftX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55)
    context.fillRect(earRightX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55)
    context.fillStyle = palette.edge
    context.fillRect(-body * 0.85, -body, body * 1.7, body * 2)
    context.fillStyle = palette.tone
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
    if (flipWeapon) context.scale(1, -1)
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

export const renderDamagePopups = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  fogCullBounds: FogCullBounds,
) => {
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.font = "0.9px monospace"
  for (const popup of world.damagePopups) {
    if (!popup.active || !isInsideFogCullBounds(popup.position.x, popup.position.y, fogCullBounds, 0.9)) continue
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
  if (damageRatio <= 0) return
  const maxDimension = Math.max(VIEW_WIDTH, VIEW_HEIGHT)
  const gradient = context.createRadialGradient(
    VIEW_WIDTH * 0.5,
    VIEW_HEIGHT * 0.5,
    maxDimension * 0.26,
    VIEW_WIDTH * 0.5,
    VIEW_HEIGHT * 0.5,
    maxDimension * 0.64,
  )
  gradient.addColorStop(0, "rgba(255, 0, 0, 0)")
  gradient.addColorStop(0.55, `rgba(255, 0, 0, ${DAMAGE_VIGNETTE_MAX_ALPHA * 0.42})`)
  gradient.addColorStop(1, `rgba(255, 0, 0, ${DAMAGE_VIGNETTE_MAX_ALPHA})`)
  context.save()
  context.globalAlpha = damageRatio ** DAMAGE_VIGNETTE_INTENSITY_CURVE
  context.fillStyle = gradient
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  context.restore()
}

export const renderOffscreenEnemyIndicators = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  renderCameraX: number,
  renderCameraY: number,
  viewportOverflow: CanvasViewportOverflowPx,
) => {
  drawOffscreenEnemyIndicators({ context, world, renderCameraX, renderCameraY, viewportOverflow, paletteForUnit })
}
