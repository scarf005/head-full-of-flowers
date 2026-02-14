import { DamagePopup, Flower, MolotovZone, Obstacle, ObstacleDebris, Pickup, Projectile, ShellCasing, Throwable, Unit, Vec2 } from "../entities.ts"
import { buildFactions, createFactionFlowerCounts, type FactionDescriptor } from "../factions.ts"
import { ARENA_START_RADIUS } from "../utils.ts"
import {
  BOT_COUNT,
  DAMAGE_POPUP_POOL_SIZE,
  FLOWER_POOL_SIZE,
  MATCH_DURATION_SECONDS,
  LOOT_PICKUP_INTERVAL_SECONDS,
  MOLOTOV_POOL_SIZE,
  OBSTACLE_POOL_SIZE,
  PICKUP_POOL_SIZE,
  PROJECTILE_POOL_SIZE,
  THROWABLE_POOL_SIZE,
  VIEW_HEIGHT,
  VIEW_WIDTH
} from "./constants.ts"
import { buildObstacleGridFromMap, type ObstacleGridState } from "./obstacle-grid.ts"
import { createBarrenGardenMap, type TerrainMap } from "./wfc-map.ts"

export interface ExplosionFx {
  active: boolean
  position: Vec2
  life: number
  radius: number
}

export interface InputState {
  keys: Set<string>
  leftDown: boolean
  rightDown: boolean
  canvasX: number
  canvasY: number
  screenX: number
  screenY: number
  worldX: number
  worldY: number
}

export interface WorldState {
  input: InputState
  player: Unit
  bots: Unit[]
  units: Unit[]
  projectiles: Projectile[]
  throwables: Throwable[]
  flowers: Flower[]
  damagePopups: DamagePopup[]
  pickups: Pickup[]
  molotovZones: MolotovZone[]
  obstacles: Obstacle[]
  obstacleDebris: ObstacleDebris[]
  shellCasings: ShellCasing[]
  explosions: ExplosionFx[]
  projectileCursor: number
  throwableCursor: number
  flowerCursor: number
  popupCursor: number
  molotovCursor: number
  camera: Vec2
  cameraOffset: Vec2
  started: boolean
  running: boolean
  paused: boolean
  finished: boolean
  audioPrimed: boolean
  timeRemaining: number
  pickupTimer: number
  factions: FactionDescriptor[]
  factionFlowerCounts: Record<string, number>
  playerBulletsFired: number
  playerBulletsHit: number
  playerKills: number
  playerDamageDealt: number
  flowerDensityGrid: Uint16Array
  flowerCellHead: Int32Array
  flowerDirtyCount: number
  playerFlowerTotal: number
  cameraShake: number
  hitStop: number
  arenaRadius: number
  terrainMap: TerrainMap
  obstacleGrid: ObstacleGridState
}

export const createWorldState = (): WorldState => {
  const factions = buildFactions(BOT_COUNT)
  const player = new Unit("player", true, "white")
  const bots = Array.from({ length: BOT_COUNT }, (_, index) => new Unit(`bot-${index + 1}`, false, "blue"))
  const terrainMap = createBarrenGardenMap(112)
  const flowerCellHead = new Int32Array(terrainMap.size * terrainMap.size)
  flowerCellHead.fill(-1)

  return {
    input: {
      keys: new Set(),
      leftDown: false,
      rightDown: false,
      canvasX: VIEW_WIDTH * 0.5,
      canvasY: VIEW_HEIGHT * 0.5,
      screenX: VIEW_WIDTH * 0.5,
      screenY: VIEW_HEIGHT * 0.5,
      worldX: 0,
      worldY: 0
    },
    player,
    bots,
    units: [player, ...bots],
    projectiles: Array.from({ length: PROJECTILE_POOL_SIZE }, () => new Projectile()),
    throwables: Array.from({ length: THROWABLE_POOL_SIZE }, () => new Throwable()),
    flowers: Array.from({ length: FLOWER_POOL_SIZE }, (_, index) => {
      const flower = new Flower()
      flower.slotIndex = index
      return flower
    }),
    damagePopups: Array.from({ length: DAMAGE_POPUP_POOL_SIZE }, () => new DamagePopup()),
    pickups: Array.from({ length: PICKUP_POOL_SIZE }, () => new Pickup()),
    molotovZones: Array.from({ length: MOLOTOV_POOL_SIZE }, () => new MolotovZone()),
    obstacles: Array.from({ length: OBSTACLE_POOL_SIZE }, (_, index) => {
      const obstacle = new Obstacle()
      obstacle.id = `obstacle-${index + 1}`
      return obstacle
    }),
    obstacleDebris: Array.from({ length: 320 }, () => new ObstacleDebris()),
    shellCasings: Array.from({ length: 220 }, () => new ShellCasing()),
    explosions: Array.from({ length: 24 }, () => ({
      active: false,
      position: new Vec2(),
      life: 0,
      radius: 0
    })),
    projectileCursor: 0,
    throwableCursor: 0,
    flowerCursor: 0,
    popupCursor: 0,
    molotovCursor: 0,
    camera: new Vec2(),
    cameraOffset: new Vec2(),
    started: false,
    running: false,
    paused: false,
    finished: false,
    audioPrimed: false,
    timeRemaining: MATCH_DURATION_SECONDS,
    pickupTimer: LOOT_PICKUP_INTERVAL_SECONDS,
    factions,
    factionFlowerCounts: createFactionFlowerCounts(factions),
    playerBulletsFired: 0,
    playerBulletsHit: 0,
    playerKills: 0,
    playerDamageDealt: 0,
    flowerDensityGrid: new Uint16Array(terrainMap.size * terrainMap.size),
    flowerCellHead,
    flowerDirtyCount: 0,
    playerFlowerTotal: 0,
    cameraShake: 0,
    hitStop: 0,
    arenaRadius: ARENA_START_RADIUS,
    terrainMap,
    obstacleGrid: buildObstacleGridFromMap(terrainMap)
  }
}
