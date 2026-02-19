import { Vec2 } from "./entities.ts"

export const ARENA_START_RADIUS = 40
export const ARENA_END_RADIUS = 20
export const ARENA_SCALE_MIN_PLAYERS = 2
export const ARENA_SCALE_BASE_PLAYERS = 8
export const ARENA_MIN_START_RADIUS = 30
export const ARENA_MIN_END_RADIUS = 15

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const lerp = (from: number, to: number, t: number) => from + (to - from) * t

export const arenaRadiiForPlayerCount = (playerCount: number) => {
  const clampedPlayers = clamp(playerCount, ARENA_SCALE_MIN_PLAYERS, ARENA_SCALE_BASE_PLAYERS)
  const scale = (clampedPlayers - ARENA_SCALE_MIN_PLAYERS) / (ARENA_SCALE_BASE_PLAYERS - ARENA_SCALE_MIN_PLAYERS)
  return {
    start: lerp(ARENA_MIN_START_RADIUS, ARENA_START_RADIUS, scale),
    end: lerp(ARENA_MIN_END_RADIUS, ARENA_END_RADIUS, scale),
  }
}

export const randomRange = (min: number, max: number) => min + Math.random() * (max - min)

export const randomInt = (min: number, max: number) => Math.floor(randomRange(min, max + 1))

export const randomPointInArena = (radius: number, borderPadding = 2) => {
  const angle = Math.random() * Math.PI * 2
  const distance = Math.sqrt(Math.random()) * Math.max(1, radius - borderPadding)
  return new Vec2(Math.cos(angle) * distance, Math.sin(angle) * distance)
}

export const limitToArena = (position: Vec2, radius: number, arenaRadius: number) => {
  const maxDistance = arenaRadius - radius
  const current = position.length()
  if (current <= maxDistance) {
    return false
  }

  if (maxDistance <= 0) {
    position.set(0, 0)
    return true
  }

  position.scale(maxDistance / (current || 1))
  return true
}

export const distSquared = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}
