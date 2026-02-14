import { clamp, lerp, limitToArena, randomInt, randomRange } from "../utils.ts"
import type { WorldState } from "../world/state.ts"

export interface FlowerSpawnDeps {
  allocFlower: () => WorldState["flowers"][number]
  playerId: string
  botPalette: (id: string) => { tone: string; edge: string }
  onPerkProgress: () => void
  onCoverageUpdated: () => void
}

const flowerPalette = (world: WorldState, ownerId: string, deps: FlowerSpawnDeps) => {
  if (ownerId === deps.playerId) {
    return {
      team: "white" as const,
      color: "#f7ffef",
      accent: "#e5efcf",
      fromPlayer: true
    }
  }

  const palette = deps.botPalette(ownerId)
  return {
    team: "blue" as const,
    color: palette.tone,
    accent: palette.edge,
    fromPlayer: false
  }
}

export const spawnFlowers = (
  world: WorldState,
  ownerId: string,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  amount: number,
  deps: FlowerSpawnDeps
) => {
  const palette = flowerPalette(world, ownerId, deps)
  const baseAngle = Math.atan2(dirY, dirX)

  for (let index = 0; index < amount; index += 1) {
    const flower = deps.allocFlower()
    if (flower.active) {
      if (flower.team === "white") {
        world.whiteFlowers = Math.max(0, world.whiteFlowers - 1)
      } else {
        world.blueFlowers = Math.max(0, world.blueFlowers - 1)
      }
    }

    const angle = baseAngle + randomRange(-0.95, 0.95)
    const distance = randomRange(0.1, 1.9)
    flower.active = true
    flower.team = palette.team
    flower.ownerId = ownerId
    flower.color = palette.color
    flower.accent = palette.accent
    flower.position.set(
      x + Math.cos(angle) * distance + randomRange(-0.06, 0.06),
      y + Math.sin(angle) * distance + randomRange(-0.06, 0.06)
    )
    limitToArena(flower.position, 0.2, world.arenaRadius)
    flower.size = 0
    flower.targetSize = randomRange(0.16, 0.42)
    flower.pop = 0

    if (palette.team === "white") {
      world.whiteFlowers += 1
    } else {
      world.blueFlowers += 1
    }
  }

  if (palette.fromPlayer) {
    world.playerFlowerTotal += amount
    deps.onPerkProgress()
  }

  deps.onCoverageUpdated()
}

export const updateFlowers = (world: WorldState, dt: number) => {
  for (const flower of world.flowers) {
    if (!flower.active) {
      continue
    }

    flower.pop = Math.min(1, flower.pop + dt * 18)
    flower.size = lerp(flower.size, flower.targetSize, flower.pop)
  }
}

export const updateDamagePopups = (world: WorldState, dt: number) => {
  for (const popup of world.damagePopups) {
    if (!popup.active) {
      continue
    }

    popup.life -= dt
    popup.position.x += popup.velocity.x * dt
    popup.position.y += popup.velocity.y * dt
    popup.velocity.y -= dt * 3.2
    popup.velocity.x *= clamp(1 - dt * 1.7, 0, 1)

    if (popup.life <= 0) {
      popup.active = false
    }
  }
}

export const randomFlowerAmount = () => randomInt(10, 20)
