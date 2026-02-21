import { t } from "@lingui/core/macro"
import { botPalette, createFactionFlowerCounts, type FactionDescriptor } from "./factions.ts"
import { randomPerkId } from "./perks.ts"
import {
  duoTeamCountSignal,
  ffaPlayerCountSignal,
  selectedGameModeSignal,
  squadTeamCountSignal,
  tdmTeamSizeSignal,
} from "./signals.ts"
import { randomLootablePrimary } from "./systems/combat.ts"
import { spawnPerkPickupAt, spawnPickupAt } from "./systems/pickups.ts"
import type { GameModeId, PrimaryWeaponId } from "./types.ts"
import { clamp, distSquared, lerp, randomPointInArena } from "./utils.ts"
import { MATCH_DURATION_SECONDS } from "./world/constants.ts"
import { arenaRadiiForPlayerCount } from "./utils.ts"
import { OBSTACLE_MATERIAL_BOX, obstacleGridIndex, worldToObstacleGrid } from "./world/obstacle-grid.ts"
import type { WorldState } from "./world/state.ts"

const HIGH_TIER_BOX_DROP_CHANCE_START = 0.07
const HIGH_TIER_BOX_DROP_CHANCE_END = 0.5
const WHITE_LOOT_BOX_SPAWN_INTERVAL_START_SECONDS = 14
const WHITE_LOOT_BOX_SPAWN_INTERVAL_END_SECONDS = 3
const WHITE_LOOT_BOX_MAX_FREQUENCY_TIME_REMAINING_SECONDS = 10
const WHITE_LOOT_BOX_HP = 8
const WHITE_LOOT_BOX_RADIUS = 0.95
const TEAM_COLOR_RAMP = [
  "#ff6f7b",
  "#68a8ff",
  "#84d8a4",
  "#f0bd6a",
  "#c9a5ff",
  "#ff9dd2",
]

export function applyMatchMode(world: WorldState, botPool: WorldState["bots"]) {
  const mode = selectedGameModeSignal.value
  const requestedPlayers = mode === "ffa"
    ? clamp(Math.round(ffaPlayerCountSignal.value), 2, 8)
    : mode === "tdm"
    ? clamp(Math.round(tdmTeamSizeSignal.value), 2, 6) * 2
    : mode === "duo"
    ? clamp(Math.round(duoTeamCountSignal.value), 2, 6) * 2
    : clamp(Math.round(squadTeamCountSignal.value), 2, 3) * 4
  const botCount = clamp(requestedPlayers - 1, 1, botPool.length)
  const totalPlayers = botCount + 1
  const activeBots = botPool.slice(0, botCount)
  const arenaRadii = arenaRadiiForPlayerCount(totalPlayers)

  if (mode === "ffa") {
    ffaPlayerCountSignal.value = totalPlayers
  }

  if (mode === "tdm") {
    tdmTeamSizeSignal.value = Math.floor(totalPlayers / 2)
  }

  if (mode === "duo") {
    duoTeamCountSignal.value = Math.max(2, Math.floor(totalPlayers / 2))
  }

  if (mode === "squad") {
    squadTeamCountSignal.value = Math.max(2, Math.floor(totalPlayers / 4))
  }

  world.bots = activeBots
  world.units = [world.player, ...activeBots]

  let factions: FactionDescriptor[] = []
  if (mode === "ffa") {
    world.player.team = world.player.id
    factions = [{ id: world.player.id, label: t`You`, color: "#f2ffe8" }]
    for (let index = 0; index < activeBots.length; index += 1) {
      const bot = activeBots[index]
      bot.team = bot.id
      factions.push({
        id: bot.id,
        label: t`Bot ${index + 1}`,
        color: botPalette(bot.id).tone,
      })
    }
  } else if (mode === "tdm") {
    const redSlots = Math.floor(totalPlayers / 2)
    const redBotCount = Math.max(0, redSlots - 1)
    world.player.team = "red"
    for (let index = 0; index < activeBots.length; index += 1) {
      activeBots[index].team = index < redBotCount ? "red" : "blue"
    }

    factions = [
      { id: "red", label: t`Red (You)`, color: TEAM_COLOR_RAMP[0] },
      { id: "blue", label: t`Blue`, color: TEAM_COLOR_RAMP[1] },
    ]
  } else {
    const teamSize = mode === "duo" ? 2 : 4
    const teamCount = Math.max(2, Math.ceil(totalPlayers / teamSize))
    const teamIds = Array.from({ length: teamCount }, (_, index) => `team-${index + 1}`)
    const units = [world.player, ...activeBots]

    for (let index = 0; index < units.length; index += 1) {
      const teamIndex = Math.min(teamIds.length - 1, Math.floor(index / teamSize))
      units[index].team = teamIds[teamIndex]
    }

    factions = teamIds.map((teamId, index) => ({
      id: teamId,
      label: mode === "duo"
        ? index === 0 ? t`Duo 1 (You)` : t`Duo ${index + 1}`
        : index === 0
        ? t`Squad 1 (You)`
        : t`Squad ${index + 1}`,
      color: TEAM_COLOR_RAMP[index % TEAM_COLOR_RAMP.length],
    }))
  }

  world.factions = factions
  world.factionFlowerCounts = createFactionFlowerCounts(factions)

  return {
    currentMode: mode,
    matchArenaStartRadius: arenaRadii.start,
    matchArenaEndRadius: arenaRadii.end,
  }
}

export function canSpawnFlamethrower(timeRemaining: number) {
  return timeRemaining <= MATCH_DURATION_SECONDS * 0.5
}

export function randomHighTierPrimary(highTierWeaponIds: PrimaryWeaponId[]) {
  if (highTierWeaponIds.length <= 0) {
    return "battle-rifle" as PrimaryWeaponId
  }

  const index = Math.floor(Math.random() * highTierWeaponIds.length)
  return highTierWeaponIds[index] ?? highTierWeaponIds[0]
}

export function highTierLootBoxChance(timeRemaining: number) {
  const elapsedRatio = clamp((MATCH_DURATION_SECONDS - timeRemaining) / MATCH_DURATION_SECONDS, 0, 1)
  return lerp(HIGH_TIER_BOX_DROP_CHANCE_START, HIGH_TIER_BOX_DROP_CHANCE_END, elapsedRatio)
}

export function whiteLootBoxSpawnIntervalSeconds(timeRemaining: number) {
  const progressToMaxFrequency = clamp(
    (MATCH_DURATION_SECONDS - timeRemaining) /
      Math.max(1, MATCH_DURATION_SECONDS - WHITE_LOOT_BOX_MAX_FREQUENCY_TIME_REMAINING_SECONDS),
    0,
    1,
  )
  return lerp(
    WHITE_LOOT_BOX_SPAWN_INTERVAL_START_SECONDS,
    WHITE_LOOT_BOX_SPAWN_INTERVAL_END_SECONDS,
    progressToMaxFrequency,
  )
}

export function randomLootablePrimaryForMatch(timeRemaining: number) {
  if (canSpawnFlamethrower(timeRemaining)) {
    return randomLootablePrimary()
  }

  return Math.random() > 0.5 ? "assault" : "shotgun"
}

export function spawnRandomWhiteLootBox(world: WorldState) {
  const grid = world.obstacleGrid

  for (let attempt = 0; attempt < 48; attempt += 1) {
    const spawn = randomPointInArena(world.arenaRadius, 1)
    const cell = worldToObstacleGrid(grid.size, spawn.x, spawn.y)
    if (cell.x < 0 || cell.y < 0 || cell.x >= grid.size || cell.y >= grid.size) {
      continue
    }

    const index = obstacleGridIndex(grid.size, cell.x, cell.y)
    if (grid.solid[index] > 0) {
      continue
    }

    const cellCenterX = cell.x - Math.floor(grid.size * 0.5) + 0.5
    const cellCenterY = cell.y - Math.floor(grid.size * 0.5) + 0.5

    let overlapsUnit = false
    for (const unit of world.units) {
      const limit = unit.radius + WHITE_LOOT_BOX_RADIUS
      if (distSquared(unit.position.x, unit.position.y, cellCenterX, cellCenterY) <= limit * limit) {
        overlapsUnit = true
        break
      }
    }
    if (overlapsUnit) {
      continue
    }

    grid.solid[index] = 1
    grid.material[index] = OBSTACLE_MATERIAL_BOX
    grid.hp[index] = WHITE_LOOT_BOX_HP
    grid.highTierLoot[index] = 1
    grid.flash[index] = 0
    grid.flashKind[index] = 0
    return
  }
}

export function spawnGuaranteedCenterHighTierLoot(world: WorldState, randomHighTier: () => PrimaryWeaponId) {
  spawnPickupAt(world, { x: 0, y: 0 }, {
    force: true,
    randomLootablePrimary: () => "assault",
    randomHighTierPrimary: randomHighTier,
    highTierChance: 1,
  })
}

export function spawnLootPickupAt(
  world: WorldState,
  x: number,
  y: number,
  options: {
    force?: boolean
    allowHighTier?: boolean
    forceHighTier?: boolean
    randomHighTier: () => PrimaryWeaponId
  },
) {
  const force = options.force ?? false
  const allowHighTier = options.allowHighTier ?? false
  const forceHighTier = options.forceHighTier ?? false
  const highTierChance = forceHighTier ? 1 : allowHighTier ? highTierLootBoxChance(world.timeRemaining) : 0

  spawnPickupAt(world, { x, y }, {
    force,
    randomLootablePrimary: () => {
      const id = randomLootablePrimaryForMatch(world.timeRemaining)
      return id === "pistol" ? "assault" : id
    },
    randomHighTierPrimary: options.randomHighTier,
    highTierChance,
  })
}

export function spawnPerkPickupDropAt(world: WorldState, x: number, y: number, force = true) {
  spawnPerkPickupAt(world, { x, y }, {
    force,
    randomPerk: () => randomPerkId(),
  })
}
