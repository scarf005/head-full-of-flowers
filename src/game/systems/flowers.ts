import { clamp, lerp, limitToArena, randomInt, randomRange } from "../utils.ts"
import type { WorldState } from "../world/state.ts"

const FLOWER_SPAWN_CONE_HALF_ANGLE = 0.95
const FLOWER_BACK_OFFSET = 0.26
const FLOWER_DISTANCE_MIN = 0.08
const FLOWER_DISTANCE_MAX = 1.85
const FLOWER_POSITION_JITTER = 0.06
const FLOWER_PUSH_ATTEMPTS = 9
const FLOWER_PUSH_DISTANCE_STEP = 0.34
const FLOWER_TILE_CAPACITY = 10
const FLOWER_SIZE_MIN = 0.16
const FLOWER_SIZE_MAX = 0.42

const FLOWER_AMOUNT_MIN = 10
const FLOWER_AMOUNT_MAX = 20
const FLOWER_DAMAGE_REFERENCE = 2.1
const FLOWER_IMPACT_SPEED_REFERENCE = 40
const FLOWER_COUNT_SCALE_MIN = 0.55
const FLOWER_COUNT_SCALE_MAX = 1.75
const FLOWER_SIZE_SCALE_MIN = 0.6
const FLOWER_SIZE_SCALE_MAX = 1.9

export interface FlowerBurstProfile {
  amount: number
  sizeScale: number
}

export interface FlowerSpawnDeps {
  allocFlower: () => WorldState["flowers"][number]
  playerId: string
  botPalette: (id: string) => { tone: string; edge: string }
  onPerkProgress: () => void
  onCoverageUpdated: () => void
}

const toHex = (value: number) => {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")
}

const pastelize = (hex: string, saturation = 0.62, lift = 0.22) => {
  const cleaned = hex.replace("#", "")
  if (cleaned.length !== 6) {
    return hex
  }

  const red = Number.parseInt(cleaned.slice(0, 2), 16)
  const green = Number.parseInt(cleaned.slice(2, 4), 16)
  const blue = Number.parseInt(cleaned.slice(4, 6), 16)
  const gray = (red + green + blue) / 3

  const softRed = red * saturation + gray * (1 - saturation)
  const softGreen = green * saturation + gray * (1 - saturation)
  const softBlue = blue * saturation + gray * (1 - saturation)

  const liftedRed = softRed + (255 - softRed) * lift
  const liftedGreen = softGreen + (255 - softGreen) * lift
  const liftedBlue = softBlue + (255 - softBlue) * lift

  return `#${toHex(liftedRed)}${toHex(liftedGreen)}${toHex(liftedBlue)}`
}

const flowerPalette = (world: WorldState, ownerId: string, deps: FlowerSpawnDeps) => {
  if (ownerId === deps.playerId) {
    return {
      team: "white" as const,
      color: "#d4d9d2",
      accent: "#b8beb6",
      fromPlayer: true
    }
  }

  const botIdCandidate = ownerId.replace("bot-", "")
  const botIndex = Number(botIdCandidate)
  if (!Number.isInteger(botIndex) || botIndex <= 0) {
    return {
      team: "white" as const,
      color: "#f0f0ea",
      accent: "#d1d0cc",
      fromPlayer: false
    }
  }

  const palette = deps.botPalette(ownerId)
  return {
    team: "blue" as const,
    color: pastelize(palette.tone, 0.34, 0.08),
    accent: pastelize(palette.edge, 0.3, 0.05),
    fromPlayer: false
  }
}

const flowerCellIndexAt = (world: WorldState, x: number, y: number) => {
  const size = world.terrainMap.size
  const half = Math.floor(size * 0.5)
  const gridX = Math.floor(x) + half
  const gridY = Math.floor(y) + half
  if (gridX < 0 || gridY < 0 || gridX >= size || gridY >= size) {
    return -1
  }

  return gridY * size + gridX
}

const removeFlowerFromDensity = (world: WorldState, flower: WorldState["flowers"][number]) => {
  if (flower.bloomCell < 0 || flower.bloomCell >= world.flowerDensityGrid.length) {
    flower.bloomCell = -1
    return
  }

  world.flowerDensityGrid[flower.bloomCell] = Math.max(0, world.flowerDensityGrid[flower.bloomCell] - 1)
  flower.bloomCell = -1
}

const pickFlowerPosition = (world: WorldState, originX: number, originY: number, angle: number) => {
  const spreadX = Math.cos(angle)
  const spreadY = Math.sin(angle)
  let chosenX = originX + spreadX * FLOWER_DISTANCE_MAX
  let chosenY = originY + spreadY * FLOWER_DISTANCE_MAX
  let lowestCount = Number.POSITIVE_INFINITY

  for (let attempt = 0; attempt < FLOWER_PUSH_ATTEMPTS; attempt += 1) {
    const distance = randomRange(FLOWER_DISTANCE_MIN, FLOWER_DISTANCE_MAX) + attempt * FLOWER_PUSH_DISTANCE_STEP
    const candidateX = originX + spreadX * distance + randomRange(-FLOWER_POSITION_JITTER, FLOWER_POSITION_JITTER)
    const candidateY = originY + spreadY * distance + randomRange(-FLOWER_POSITION_JITTER, FLOWER_POSITION_JITTER)
    const cellIndex = flowerCellIndexAt(world, candidateX, candidateY)
    const cellCount = cellIndex < 0 ? 0 : world.flowerDensityGrid[cellIndex]
    if (cellCount < lowestCount) {
      lowestCount = cellCount
      chosenX = candidateX
      chosenY = candidateY
    }

    if (cellCount < FLOWER_TILE_CAPACITY) {
      return { x: candidateX, y: candidateY }
    }
  }

  return { x: chosenX, y: chosenY }
}

export const spawnFlowers = (
  world: WorldState,
  ownerId: string,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  amount: number,
  sizeScale: number,
  deps: FlowerSpawnDeps
) => {
  const palette = flowerPalette(world, ownerId, deps)
  const dirLength = Math.hypot(dirX, dirY) || 1
  const nx = dirX / dirLength
  const ny = dirY / dirLength
  const baseAngle = Math.atan2(ny, nx)
  const originX = x + nx * FLOWER_BACK_OFFSET
  const originY = y + ny * FLOWER_BACK_OFFSET
  const bloomScale = clamp(sizeScale, FLOWER_SIZE_SCALE_MIN, FLOWER_SIZE_SCALE_MAX)

  for (let index = 0; index < amount; index += 1) {
    const flower = deps.allocFlower()
    if (flower.active) {
      const previousOwner = flower.ownerId
      if (previousOwner in world.factionFlowerCounts) {
        world.factionFlowerCounts[previousOwner] = Math.max(0, world.factionFlowerCounts[previousOwner] - 1)
      }
      removeFlowerFromDensity(world, flower)
    }

    const angle = baseAngle + randomRange(-FLOWER_SPAWN_CONE_HALF_ANGLE, FLOWER_SPAWN_CONE_HALF_ANGLE)
    const spawn = pickFlowerPosition(world, originX, originY, angle)
    flower.active = true
    flower.team = palette.team
    flower.ownerId = ownerId
    flower.color = palette.color
    flower.accent = palette.accent
    flower.scorched = false
    flower.position.set(
      spawn.x,
      spawn.y
    )
    limitToArena(flower.position, 0.2, world.arenaRadius)
    flower.bloomCell = flowerCellIndexAt(world, flower.position.x, flower.position.y)
    if (flower.bloomCell >= 0) {
      world.flowerDensityGrid[flower.bloomCell] = Math.min(65535, world.flowerDensityGrid[flower.bloomCell] + 1)
    }
    flower.size = 0
    flower.targetSize = randomRange(FLOWER_SIZE_MIN, FLOWER_SIZE_MAX) * bloomScale
    flower.pop = 0

    if (ownerId in world.factionFlowerCounts) {
      world.factionFlowerCounts[ownerId] += 1
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

export const randomFlowerBurst = (damage: number, impactSpeed: number): FlowerBurstProfile => {
  const damageFactor = clamp(damage / FLOWER_DAMAGE_REFERENCE, 0.35, 2.4)
  const speedFactor = clamp(impactSpeed / FLOWER_IMPACT_SPEED_REFERENCE, 0.2, 2.2)

  const amountScale = clamp(
    1 + (speedFactor - 1) * 0.65 - (damageFactor - 1) * 0.5,
    FLOWER_COUNT_SCALE_MIN,
    FLOWER_COUNT_SCALE_MAX
  )
  const sizeScale = clamp(
    1 + (damageFactor - 1) * 0.7 - (speedFactor - 1) * 0.45,
    FLOWER_SIZE_SCALE_MIN,
    FLOWER_SIZE_SCALE_MAX
  )

  return {
    amount: Math.max(2, Math.round(randomInt(FLOWER_AMOUNT_MIN, FLOWER_AMOUNT_MAX) * amountScale)),
    sizeScale
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
