import {
  coverageSlicesSignal,
  crosshairSignal,
  fpsSignal,
  hpSignal,
  matchResultSignal,
  menuVisibleSignal,
  pausedSignal,
  primaryAmmoSignal,
  primaryWeaponIconSignal,
  primaryWeaponSignal,
  secondaryModeSignal,
  secondaryWeaponCooldownSignal,
  statusMessageSignal,
  timeRemainingSignal,
} from "../signals.ts"
import { BURNED_FACTION_COLOR, BURNED_FACTION_ID } from "../factions.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import { MATCH_DURATION_SECONDS } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"
import { t } from "@lingui/core/macro"
import type { PrimaryWeaponId } from "../types.ts"

const defaultMatchResult = {
  visible: false,
  winnerLabel: "",
  winnerColor: "#f2ffe8",
  pieGradient: "conic-gradient(#f2ffe8 0deg 360deg)",
  stats: [],
  standings: [],
}

const localizeWeapon = (weaponId: PrimaryWeaponId) => {
  if (weaponId === "pistol") {
    return t`Pistol`
  }
  if (weaponId === "assault") {
    return t`Assault Rifle`
  }
  if (weaponId === "shotgun") {
    return t`Shotgun`
  }

  return t`Flamethrower`
}

const buildCoverageSlices = (world: WorldState) => {
  const entries = world.factions.map((faction) => ({
    id: faction.id,
    label: faction.label,
    color: faction.color,
    count: world.factionFlowerCounts[faction.id] ?? 0,
  }))

  const burntCount = world.factionFlowerCounts[BURNED_FACTION_ID] ?? 0
  if (burntCount > 0) {
    entries.push({
      id: BURNED_FACTION_ID,
      label: t`Burnt`,
      color: BURNED_FACTION_COLOR,
      count: burntCount,
    })
  }

  const total = entries.reduce((sum, entry) => {
    return sum + entry.count
  }, 0)

  if (total <= 0) {
    const defaultSliceCount = Math.max(1, entries.length)
    const percent = 100 / defaultSliceCount
    return entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      color: entry.color,
      percent,
    }))
  }

  return entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    color: entry.color,
    percent: (100 * entry.count) / total,
  }))
}

const buildPieGradient = (slices: { color: string; percent: number }[]) => {
  let angle = 0
  const stops = slices.map((slice) => {
    const start = angle
    angle += (slice.percent / 100) * 360
    return `${slice.color} ${start.toFixed(2)}deg ${angle.toFixed(2)}deg`
  })

  return `conic-gradient(${stops.join(", ")})`
}

export const resetHudSignals = (world: WorldState, canvas: HTMLCanvasElement) => {
  timeRemainingSignal.value = MATCH_DURATION_SECONDS
  fpsSignal.value = 0
  pausedSignal.value = false
  coverageSlicesSignal.value = buildCoverageSlices(world)
  matchResultSignal.value = defaultMatchResult
  primaryWeaponSignal.value = localizeWeapon(world.player.primaryWeapon)
  primaryWeaponIconSignal.value = PRIMARY_WEAPONS[world.player.primaryWeapon].icon
  primaryAmmoSignal.value = "∞"
  secondaryModeSignal.value = "grenade"
  secondaryWeaponCooldownSignal.value = t`RMB to throw`
  hpSignal.value = { hp: world.player.hp, maxHp: world.player.maxHp }
  statusMessageSignal.value = t`Click once to wake audio, then begin fighting`
  menuVisibleSignal.value = true
  crosshairSignal.value = {
    x: canvas.clientWidth * 0.5,
    y: canvas.clientHeight * 0.5,
    visible: false,
  }
}

export const setFpsSignal = (fps: number) => {
  fpsSignal.value = Math.max(0, fps)
}

export const updateCoverageSignals = (world: WorldState) => {
  coverageSlicesSignal.value = buildCoverageSlices(world)
}

export const updatePlayerWeaponSignals = (world: WorldState) => {
  const config = PRIMARY_WEAPONS[world.player.primaryWeapon]
  primaryWeaponSignal.value = localizeWeapon(config.id)
  primaryWeaponIconSignal.value = config.icon
  if (world.player.reloadCooldown > 0) {
    primaryAmmoSignal.value = t`Reloading...`
    return
  }

  primaryAmmoSignal.value = Number.isFinite(world.player.primaryAmmo)
    ? `${Math.floor(world.player.primaryAmmo)} / ${
      Number.isFinite(world.player.reserveAmmo) ? Math.floor(world.player.reserveAmmo) : "∞"
    }`
    : "∞"
}

const updateSecondaryCooldownSignal = (world: WorldState) => {
  if (!world.player.secondaryCooldown) {
    secondaryWeaponCooldownSignal.value = t`RMB to throw`
    return
  }

  secondaryWeaponCooldownSignal.value = `${Math.max(0, world.player.secondaryCooldown).toFixed(1)}s`
}

export const syncHudSignals = (world: WorldState) => {
  timeRemainingSignal.value = world.timeRemaining
  hpSignal.value = {
    hp: Math.round(world.player.hp),
    maxHp: Math.round(world.player.maxHp),
  }
  updatePlayerWeaponSignals(world)
  updateSecondaryCooldownSignal(world)
}

export const updatePlayerHpSignal = (world: WorldState) => {
  hpSignal.value = {
    hp: Math.round(world.player.hp),
    maxHp: Math.round(world.player.maxHp),
  }
}

export const setMatchResultSignal = (
  winner: { label: string; color: string },
  slices: { color: string; percent: number }[],
  stats: { label: string; value: string }[],
  standings: { id: string; label: string; color: string; flowers: number; percent: number }[],
) => {
  matchResultSignal.value = {
    visible: true,
    winnerLabel: winner.label,
    winnerColor: winner.color,
    pieGradient: buildPieGradient(slices),
    stats,
    standings,
  }
}

export const clearMatchResultSignal = () => {
  matchResultSignal.value = defaultMatchResult
}
