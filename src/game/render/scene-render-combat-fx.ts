import { drawFlameProjectileSprite, drawItemPickupSprite } from "./pixel-art.ts"
import { clamp, randomRange } from "../utils.ts"
import { type CullBounds, isInsideCullBounds } from "../cull.ts"
import type { WorldState } from "../world/state.ts"

const BULLET_TRAIL_WIDTH_SCALE = 4
const ROCKET_TRAIL_LENGTH_MULTIPLIER = 4

type FogCullBounds = CullBounds

const isInsideFogCullBounds = (x: number, y: number, bounds: FogCullBounds, padding = 0) => {
  return isInsideCullBounds(x, y, bounds, padding)
}

export const renderObstacleDebris = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  fogCullBounds: FogCullBounds,
) => {
  for (const debris of world.obstacleDebris) {
    if (!debris.active || debris.maxLife <= 0) {
      continue
    }

    if (!isInsideFogCullBounds(debris.position.x, debris.position.y, fogCullBounds, debris.size + 0.35)) {
      continue
    }

    const lifeRatio = clamp(debris.life / debris.maxLife, 0, 1)
    const alpha = lifeRatio * lifeRatio
    const size = debris.size * (0.7 + (1 - lifeRatio) * 0.5)

    context.save()
    context.globalAlpha = alpha
    context.translate(debris.position.x, debris.position.y)
    context.rotate(debris.rotation)
    context.fillStyle = debris.color
    context.fillRect(-size * 0.5, -size * 0.5, size, size)
    context.fillStyle = "rgba(24, 18, 16, 0.34)"
    context.fillRect(-size * 0.5, size * 0.1, size, size * 0.2)
    context.restore()
  }
}

export const renderShellCasings = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  fogCullBounds: FogCullBounds,
  spriteMode: "all" | "only-sprite" | "only-plain" = "all",
) => {
  for (const casing of world.shellCasings) {
    if (!casing.active || casing.maxLife <= 0) {
      continue
    }
    if (spriteMode === "only-sprite" && !casing.spriteId) {
      continue
    }
    if (spriteMode === "only-plain" && casing.spriteId) {
      continue
    }

    if (!isInsideFogCullBounds(casing.position.x, casing.position.y, fogCullBounds, casing.size + 0.3)) {
      continue
    }

    const lifeRatio = clamp(casing.life / casing.maxLife, 0, 1)
    context.save()
    context.globalAlpha = lifeRatio * 0.9
    context.translate(casing.position.x, casing.position.y)
    context.rotate(casing.rotation)
    if (casing.spriteId) {
      drawItemPickupSprite(context, casing.spriteId, 0, 0, casing.spriteSize > 0 ? casing.spriteSize : casing.size)
    } else {
      context.fillStyle = "#e7c66a"
      context.fillRect(-casing.size * 0.5, -casing.size * 0.28, casing.size, casing.size * 0.56)
      context.fillStyle = "#b18b34"
      context.fillRect(-casing.size * 0.5, casing.size * 0.03, casing.size, casing.size * 0.16)
    }
    context.restore()
  }
}

export const renderExplosions = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  fogCullBounds: FogCullBounds,
) => {
  for (const explosion of world.explosions) {
    if (!explosion.active) {
      continue
    }

    if (!isInsideFogCullBounds(explosion.position.x, explosion.position.y, fogCullBounds, explosion.radius + 0.85)) {
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
        explosion.radius * 2 * pulse,
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
        0.16,
      )
    }
  }
}

export const renderMuzzleFlashes = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  fogCullBounds: FogCullBounds,
) => {
  for (const flash of world.muzzleFlashes) {
    if (!flash.active) {
      continue
    }

    if (!isInsideFogCullBounds(flash.position.x, flash.position.y, fogCullBounds, flash.radius * 2.4)) {
      flash.active = false
      continue
    }

    const radius = Math.max(0.08, flash.radius)
    context.save()
    context.globalCompositeOperation = "lighter"
    context.fillStyle = "rgba(255, 120, 42, 0.42)"
    context.beginPath()
    context.arc(flash.position.x, flash.position.y, radius * 1.9, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = "rgba(255, 166, 68, 0.78)"
    context.beginPath()
    context.arc(flash.position.x, flash.position.y, radius * 1.16, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = "rgba(255, 214, 150, 0.96)"
    context.beginPath()
    context.arc(flash.position.x, flash.position.y, radius * 0.56, 0, Math.PI * 2)
    context.fill()
    context.restore()

    flash.active = false
  }
}

export const renderProjectiles = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  renderTrails: boolean,
  fogCullBounds: FogCullBounds,
) => {
  for (const projectile of world.projectiles) {
    if (!projectile.active) {
      continue
    }

    if (
      !isInsideFogCullBounds(projectile.position.x, projectile.position.y, fogCullBounds, projectile.radius * 3.2 + 0.7)
    ) {
      continue
    }

    const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
    const angle = Math.atan2(projectile.velocity.y, projectile.velocity.x)
    const stretch = projectile.kind === "rocket"
      ? clamp(speed / 25, 0.2, 2.9)
      : clamp(speed / 25, 1.1, projectile.kind === "flame" ? 2.2 : 2.9)
    const length = projectile.radius * 2.6 * stretch
    const width = projectile.radius * 1.4
    const glow = projectile.radius * (2.2 + projectile.glow)

    context.fillStyle = "rgba(0, 0, 0, 0.26)"
    context.beginPath()
    context.ellipse(
      projectile.position.x,
      projectile.position.y + 0.26,
      projectile.radius * 0.8,
      projectile.radius * 0.45,
      0,
      0,
      Math.PI * 2,
    )
    context.fill()

    if (projectile.kind === "flame") {
      context.fillStyle = "rgba(255, 148, 72, 0.36)"
      context.beginPath()
      context.arc(projectile.position.x, projectile.position.y, glow, 0, Math.PI * 2)
      context.fill()
    } else {
      context.fillStyle = "rgba(255, 245, 208, 0.16)"
      context.beginPath()
      context.arc(projectile.position.x, projectile.position.y, projectile.radius * 1.05, 0, Math.PI * 2)
      context.fill()
    }

    if (renderTrails) {
      context.save()
      context.translate(projectile.position.x, projectile.position.y)
      context.rotate(angle)

      if (projectile.kind === "rocket") {
        const trailLength = length * 1.45 * ROCKET_TRAIL_LENGTH_MULTIPLIER
        for (let index = 0; index < 7; index += 1) {
          const t = index / 6
          const alpha = (1 - t) * 0.5
          const spread = (index - 3) * width * (0.12 + t * 0.12)
          context.fillStyle = `rgba(60, 66, 74, ${alpha})`
          context.beginPath()
          context.ellipse(
            -trailLength * (0.24 + t * 0.62),
            spread,
            width * (0.42 + t * 0.28),
            width * (0.42 + t * 0.28),
            0,
            0,
            Math.PI * 2,
          )
          context.fill()
        }
      } else {
        const trailLength = projectile.kind === "flame" ? length * 1.1 : length * 1.65
        for (let index = 0; index < 6; index += 1) {
          const t = index / 5
          const alpha = projectile.kind === "flame" ? (1 - t) * 0.2 : (1 - t) * 0.22
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
            Math.PI * 2,
          )
          context.fill()
        }
      }

      context.restore()
    }

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
