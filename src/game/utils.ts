import { Vec2 } from "./entities.ts"

export const ARENA_RADIUS = 380

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const lerp = (from: number, to: number, t: number) => from + (to - from) * t

export const randomRange = (min: number, max: number) => min + Math.random() * (max - min)

export const randomInt = (min: number, max: number) => Math.floor(randomRange(min, max + 1))

export const randomPointInArena = () => {
  const angle = Math.random() * Math.PI * 2
  const distance = Math.sqrt(Math.random()) * (ARENA_RADIUS - 48)
  return new Vec2(Math.cos(angle) * distance, Math.sin(angle) * distance)
}

export const limitToArena = (position: Vec2, radius: number) => {
  const maxDistance = ARENA_RADIUS - radius
  const current = position.length()
  if (current <= maxDistance) {
    return
  }

  position.scale(maxDistance / (current || 1))
}

export const distSquared = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}
