import { clamp } from "../utils.ts"
import type { WorldState } from "../world/state.ts"

const MINIMAP_PROJECTILE_RADIUS_PX = 1.2
const MINIMAP_EXPLOSIVE_PROJECTILE_RADIUS_PX = 1.9
const MINIMAP_FRIENDLY_PROJECTILE_COLOR = "rgba(255, 227, 144, 0.92)"
const MINIMAP_HOSTILE_PROJECTILE_COLOR = "rgba(255, 121, 106, 0.9)"
const MINIMAP_FRIENDLY_PROJECTILE_TRAIL_COLOR = "rgba(255, 224, 148, 0.58)"
const MINIMAP_HOSTILE_PROJECTILE_TRAIL_COLOR = "rgba(255, 126, 112, 0.56)"
const MINIMAP_PROJECTILE_TRAIL_PIXELS_PER_SPEED = 0.06
const MINIMAP_PROJECTILE_TRAIL_MIN_LENGTH_PX = 0.75
const MINIMAP_PROJECTILE_TRAIL_MAX_LENGTH_PX = 3.4
const MINIMAP_EXPLOSIVE_PROJECTILE_TRAIL_MAX_LENGTH_PX = 4.2
const MINIMAP_PROJECTILE_TRAIL_LINE_WIDTH_PX = 1
const MINIMAP_EXPLOSIVE_PROJECTILE_TRAIL_LINE_WIDTH_PX = 1.45
const MINIMAP_EXPLOSION_COLOR = "rgba(255, 136, 56, 0.92)"
const MINIMAP_EXPLOSION_MIN_RADIUS_PX = 1.1
const ROCKET_TRAIL_LENGTH_MULTIPLIER = 4
const MINIMAP_PROJECTILE_SAMPLE_LIMIT = 180
const MINIMAP_THROWABLE_SAMPLE_LIMIT = 72
const MINIMAP_EXPLOSION_SAMPLE_LIMIT = 36
const MINIMAP_MAX_DRAWN_MARKERS_PER_BATCH = 170
const MINIMAP_MAX_DRAWN_TRAIL_SEGMENTS_PER_BATCH = 140
const MINIMAP_MAX_DRAWN_EXPLOSIONS = 28
const MINIMAP_DYNAMIC_LAYER_REFRESH_INTERVAL_MS = 66
const MINIMAP_DYNAMIC_LAYER_HIGH_LOAD_FLOWER_DIRTY_THRESHOLD = 240
const MINIMAP_DYNAMIC_LAYER_HIGH_LOAD_REFRESH_INTERVAL_MS = 120

const minimapFriendlyProjectileMarkers: number[] = []
const minimapFriendlyExplosiveProjectileMarkers: number[] = []
const minimapHostileProjectileMarkers: number[] = []
const minimapHostileExplosiveProjectileMarkers: number[] = []
const minimapFriendlyProjectileTrailSegments: number[] = []
const minimapFriendlyExplosiveProjectileTrailSegments: number[] = []
const minimapHostileProjectileTrailSegments: number[] = []
const minimapHostileExplosiveProjectileTrailSegments: number[] = []
const minimapExplosionMarkers: number[] = []

let minimapDynamicLayerCache: {
  nextRefreshAt: number
  centerX: number
  centerY: number
  radiusPx: number
  arenaRadiusWorld: number
} = {
  nextRefreshAt: 0,
  centerX: 0,
  centerY: 0,
  radiusPx: 0,
  arenaRadiusWorld: 0,
}

const drawMinimapMarkerBatch = (
  context: CanvasRenderingContext2D,
  markers: number[],
  radiusPx: number,
  fillStyle: string,
) => {
  if (markers.length <= 0) {
    return
  }

  const size = radiusPx * 2
  const markerCount = markers.length / 2
  const markerStep = Math.max(1, Math.ceil(markerCount / MINIMAP_MAX_DRAWN_MARKERS_PER_BATCH))
  context.fillStyle = fillStyle
  for (let index = 0; index < markers.length; index += markerStep * 2) {
    context.fillRect(markers[index] - radiusPx, markers[index + 1] - radiusPx, size, size)
  }
}

const drawMinimapTrailBatch = (
  context: CanvasRenderingContext2D,
  segments: number[],
  lineWidthPx: number,
  strokeStyle: string,
) => {
  if (segments.length <= 0) {
    return
  }

  const segmentCount = segments.length / 4
  const segmentStep = Math.max(1, Math.ceil(segmentCount / MINIMAP_MAX_DRAWN_TRAIL_SEGMENTS_PER_BATCH))

  context.strokeStyle = strokeStyle
  context.lineWidth = lineWidthPx
  context.lineCap = "round"
  context.beginPath()
  for (let index = 0; index < segments.length; index += segmentStep * 4) {
    context.moveTo(segments[index], segments[index + 1])
    context.lineTo(segments[index + 2], segments[index + 3])
  }
  context.stroke()
}

const collectMinimapProjectileMarkers = (
  world: WorldState,
  centerX: number,
  centerY: number,
  minimapRadiusPx: number,
  arenaRadiusWorld: number,
) => {
  minimapFriendlyProjectileMarkers.length = 0
  minimapFriendlyExplosiveProjectileMarkers.length = 0
  minimapHostileProjectileMarkers.length = 0
  minimapHostileExplosiveProjectileMarkers.length = 0
  minimapFriendlyProjectileTrailSegments.length = 0
  minimapFriendlyExplosiveProjectileTrailSegments.length = 0
  minimapHostileProjectileTrailSegments.length = 0
  minimapHostileExplosiveProjectileTrailSegments.length = 0

  const playerId = world.player.id
  const playerTeam = world.player.team
  const isFfa = playerTeam === playerId
  const worldToMinimapScale = minimapRadiusPx / arenaRadiusWorld
  const minimapRadiusSquared = minimapRadiusPx * minimapRadiusPx
  const minX = centerX - minimapRadiusPx
  const maxX = centerX + minimapRadiusPx
  const minY = centerY - minimapRadiusPx
  const maxY = centerY + minimapRadiusPx
  const projectileStep = Math.max(1, Math.ceil(world.projectiles.length / MINIMAP_PROJECTILE_SAMPLE_LIMIT))

  for (let projectileIndex = 0; projectileIndex < world.projectiles.length; projectileIndex += projectileStep) {
    const projectile = world.projectiles[projectileIndex]
    if (!projectile.active) {
      continue
    }

    const markerX = centerX + projectile.position.x * worldToMinimapScale
    const markerY = centerY + projectile.position.y * worldToMinimapScale
    if (markerX < minX || markerX > maxX || markerY < minY || markerY > maxY) {
      continue
    }

    const deltaX = markerX - centerX
    const deltaY = markerY - centerY
    if (deltaX * deltaX + deltaY * deltaY > minimapRadiusSquared) {
      continue
    }

    const isFriendlyProjectile = projectile.ownerId === playerId ||
      (!isFfa && projectile.ownerTeam === playerTeam)
    const isExplosiveProjectile = projectile.kind === "grenade" || projectile.kind === "rocket"
    const isRocketProjectile = projectile.kind === "rocket"
    const speedSquared = projectile.velocity.x * projectile.velocity.x + projectile.velocity.y * projectile.velocity.y
    if (speedSquared > 0.00001) {
      const speed = Math.sqrt(speedSquared)
      const trailMaxLengthPx = isRocketProjectile
        ? MINIMAP_EXPLOSIVE_PROJECTILE_TRAIL_MAX_LENGTH_PX * ROCKET_TRAIL_LENGTH_MULTIPLIER
        : isExplosiveProjectile
        ? MINIMAP_EXPLOSIVE_PROJECTILE_TRAIL_MAX_LENGTH_PX
        : MINIMAP_PROJECTILE_TRAIL_MAX_LENGTH_PX
      const trailLengthPx = clamp(
        speed * worldToMinimapScale * MINIMAP_PROJECTILE_TRAIL_PIXELS_PER_SPEED,
        MINIMAP_PROJECTILE_TRAIL_MIN_LENGTH_PX,
        trailMaxLengthPx,
      )
      const inverseSpeed = 1 / speed
      const trailStartX = markerX - projectile.velocity.x * inverseSpeed * trailLengthPx
      const trailStartY = markerY - projectile.velocity.y * inverseSpeed * trailLengthPx

      if (isFriendlyProjectile) {
        if (isExplosiveProjectile) {
          minimapFriendlyExplosiveProjectileTrailSegments.push(trailStartX, trailStartY, markerX, markerY)
        } else {
          minimapFriendlyProjectileTrailSegments.push(trailStartX, trailStartY, markerX, markerY)
        }
      } else if (isExplosiveProjectile) {
        minimapHostileExplosiveProjectileTrailSegments.push(trailStartX, trailStartY, markerX, markerY)
      } else {
        minimapHostileProjectileTrailSegments.push(trailStartX, trailStartY, markerX, markerY)
      }
    }

    if (isFriendlyProjectile) {
      if (isExplosiveProjectile) {
        minimapFriendlyExplosiveProjectileMarkers.push(markerX, markerY)
      } else {
        minimapFriendlyProjectileMarkers.push(markerX, markerY)
      }
      continue
    }

    if (isExplosiveProjectile) {
      minimapHostileExplosiveProjectileMarkers.push(markerX, markerY)
    } else {
      minimapHostileProjectileMarkers.push(markerX, markerY)
    }
  }

  const throwableStep = Math.max(1, Math.ceil(world.throwables.length / MINIMAP_THROWABLE_SAMPLE_LIMIT))

  for (let throwableIndex = 0; throwableIndex < world.throwables.length; throwableIndex += throwableStep) {
    const throwable = world.throwables[throwableIndex]
    if (!throwable.active) {
      continue
    }

    const markerX = centerX + throwable.position.x * worldToMinimapScale
    const markerY = centerY + throwable.position.y * worldToMinimapScale
    if (markerX < minX || markerX > maxX || markerY < minY || markerY > maxY) {
      continue
    }

    const deltaX = markerX - centerX
    const deltaY = markerY - centerY
    if (deltaX * deltaX + deltaY * deltaY > minimapRadiusSquared) {
      continue
    }

    const isFriendlyThrowable = throwable.ownerId === playerId ||
      (!isFfa && throwable.ownerTeam === playerTeam)
    const speedSquared = throwable.velocity.x * throwable.velocity.x + throwable.velocity.y * throwable.velocity.y
    if (speedSquared > 0.00001) {
      const speed = Math.sqrt(speedSquared)
      const trailLengthPx = clamp(
        speed * worldToMinimapScale * MINIMAP_PROJECTILE_TRAIL_PIXELS_PER_SPEED,
        MINIMAP_PROJECTILE_TRAIL_MIN_LENGTH_PX,
        MINIMAP_PROJECTILE_TRAIL_MAX_LENGTH_PX,
      )
      const inverseSpeed = 1 / speed
      const trailStartX = markerX - throwable.velocity.x * inverseSpeed * trailLengthPx
      const trailStartY = markerY - throwable.velocity.y * inverseSpeed * trailLengthPx

      if (isFriendlyThrowable) {
        minimapFriendlyProjectileTrailSegments.push(trailStartX, trailStartY, markerX, markerY)
      } else {
        minimapHostileProjectileTrailSegments.push(trailStartX, trailStartY, markerX, markerY)
      }
    }

    if (isFriendlyThrowable) {
      minimapFriendlyProjectileMarkers.push(markerX, markerY)
    } else {
      minimapHostileProjectileMarkers.push(markerX, markerY)
    }
  }
}

const drawMinimapProjectileMarkers = (context: CanvasRenderingContext2D) => {
  drawMinimapTrailBatch(
    context,
    minimapFriendlyProjectileTrailSegments,
    MINIMAP_PROJECTILE_TRAIL_LINE_WIDTH_PX,
    MINIMAP_FRIENDLY_PROJECTILE_TRAIL_COLOR,
  )
  drawMinimapTrailBatch(
    context,
    minimapFriendlyExplosiveProjectileTrailSegments,
    MINIMAP_EXPLOSIVE_PROJECTILE_TRAIL_LINE_WIDTH_PX,
    MINIMAP_FRIENDLY_PROJECTILE_TRAIL_COLOR,
  )
  drawMinimapTrailBatch(
    context,
    minimapHostileProjectileTrailSegments,
    MINIMAP_PROJECTILE_TRAIL_LINE_WIDTH_PX,
    MINIMAP_HOSTILE_PROJECTILE_TRAIL_COLOR,
  )
  drawMinimapTrailBatch(
    context,
    minimapHostileExplosiveProjectileTrailSegments,
    MINIMAP_EXPLOSIVE_PROJECTILE_TRAIL_LINE_WIDTH_PX,
    MINIMAP_HOSTILE_PROJECTILE_TRAIL_COLOR,
  )

  drawMinimapMarkerBatch(
    context,
    minimapFriendlyProjectileMarkers,
    MINIMAP_PROJECTILE_RADIUS_PX,
    MINIMAP_FRIENDLY_PROJECTILE_COLOR,
  )
  drawMinimapMarkerBatch(
    context,
    minimapFriendlyExplosiveProjectileMarkers,
    MINIMAP_EXPLOSIVE_PROJECTILE_RADIUS_PX,
    MINIMAP_FRIENDLY_PROJECTILE_COLOR,
  )
  drawMinimapMarkerBatch(
    context,
    minimapHostileProjectileMarkers,
    MINIMAP_PROJECTILE_RADIUS_PX,
    MINIMAP_HOSTILE_PROJECTILE_COLOR,
  )
  drawMinimapMarkerBatch(
    context,
    minimapHostileExplosiveProjectileMarkers,
    MINIMAP_EXPLOSIVE_PROJECTILE_RADIUS_PX,
    MINIMAP_HOSTILE_PROJECTILE_COLOR,
  )
}

const collectMinimapExplosionMarkers = (
  world: WorldState,
  centerX: number,
  centerY: number,
  minimapRadiusPx: number,
  arenaRadiusWorld: number,
) => {
  minimapExplosionMarkers.length = 0
  const worldToMinimapScale = minimapRadiusPx / arenaRadiusWorld
  const explosionStep = Math.max(1, Math.ceil(world.explosions.length / MINIMAP_EXPLOSION_SAMPLE_LIMIT))

  for (let explosionIndex = 0; explosionIndex < world.explosions.length; explosionIndex += explosionStep) {
    const explosion = world.explosions[explosionIndex]
    if (!explosion.active || explosion.radius <= 0.01) {
      continue
    }

    const deltaX = explosion.position.x * worldToMinimapScale
    const deltaY = explosion.position.y * worldToMinimapScale
    const drawRadiusPx = Math.max(MINIMAP_EXPLOSION_MIN_RADIUS_PX, explosion.radius * worldToMinimapScale)
    const visibilityRadiusPx = minimapRadiusPx + drawRadiusPx
    if (deltaX * deltaX + deltaY * deltaY > visibilityRadiusPx * visibilityRadiusPx) {
      continue
    }

    const markerX = centerX + deltaX
    const markerY = centerY + deltaY
    minimapExplosionMarkers.push(markerX, markerY, drawRadiusPx)
  }
}

const drawMinimapExplosions = (context: CanvasRenderingContext2D) => {
  if (minimapExplosionMarkers.length <= 0) {
    return
  }

  const explosionCount = minimapExplosionMarkers.length / 3
  const explosionStep = Math.max(1, Math.ceil(explosionCount / MINIMAP_MAX_DRAWN_EXPLOSIONS))

  context.fillStyle = MINIMAP_EXPLOSION_COLOR
  for (let index = 0; index < minimapExplosionMarkers.length; index += explosionStep * 3) {
    context.beginPath()
    context.arc(
      minimapExplosionMarkers[index],
      minimapExplosionMarkers[index + 1],
      minimapExplosionMarkers[index + 2],
      0,
      Math.PI * 2,
    )
    context.fill()
  }
}

const refreshMinimapDynamicLayer = (
  world: WorldState,
  centerX: number,
  centerY: number,
  minimapRadiusPx: number,
  arenaRadiusWorld: number,
) => {
  collectMinimapProjectileMarkers(world, centerX, centerY, minimapRadiusPx, arenaRadiusWorld)
  collectMinimapExplosionMarkers(world, centerX, centerY, minimapRadiusPx, arenaRadiusWorld)
}

export const drawMinimapDynamics = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  centerX: number,
  centerY: number,
  minimapRadiusPx: number,
  arenaRadiusWorld: number,
) => {
  const now = typeof performance !== "undefined" ? performance.now() : 0
  const shouldRefreshDynamicLayer = now >= minimapDynamicLayerCache.nextRefreshAt ||
    Math.abs(minimapDynamicLayerCache.centerX - centerX) >= 0.5 ||
    Math.abs(minimapDynamicLayerCache.centerY - centerY) >= 0.5 ||
    Math.abs(minimapDynamicLayerCache.radiusPx - minimapRadiusPx) >= 0.5 ||
    Math.abs(minimapDynamicLayerCache.arenaRadiusWorld - arenaRadiusWorld) >= 0.001

  if (shouldRefreshDynamicLayer) {
    refreshMinimapDynamicLayer(world, centerX, centerY, minimapRadiusPx, arenaRadiusWorld)
    const dynamicRefreshInterval = world.flowerDirtyCount >= MINIMAP_DYNAMIC_LAYER_HIGH_LOAD_FLOWER_DIRTY_THRESHOLD
      ? MINIMAP_DYNAMIC_LAYER_HIGH_LOAD_REFRESH_INTERVAL_MS
      : MINIMAP_DYNAMIC_LAYER_REFRESH_INTERVAL_MS
    minimapDynamicLayerCache = {
      nextRefreshAt: now + dynamicRefreshInterval,
      centerX,
      centerY,
      radiusPx: minimapRadiusPx,
      arenaRadiusWorld,
    }
  }

  drawMinimapProjectileMarkers(context)
  drawMinimapExplosions(context)
}
