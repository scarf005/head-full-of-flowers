import {
  coverageSlicesSignal,
  crosshairSignal,
  fpsSignal,
  hpSignal,
  matchResultSignal,
  pausedSignal,
  primaryAmmoSignal,
  primaryWeaponIconSignal,
  primaryWeaponSignal,
  secondaryWeaponIconSignal,
  secondaryWeaponCooldownSignal,
  secondaryWeaponSignal,
  statusMessageSignal,
  timeRemainingSignal
} from "../signals.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import { MATCH_DURATION_SECONDS } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"

const defaultMatchResult = {
  visible: false,
  winnerLabel: "",
  winnerColor: "#f2ffe8",
  pieGradient: "conic-gradient(#f2ffe8 0deg 360deg)",
  stats: [],
  standings: []
}

const buildCoverageSlices = (world: WorldState) => {
  const total = world.factions.reduce((sum, faction) => {
    return sum + (world.factionFlowerCounts[faction.id] ?? 0)
  }, 0)

  if (total <= 0) {
    const percent = 100 / Math.max(1, world.factions.length)
    return world.factions.map((faction) => ({
      id: faction.id,
      label: faction.label,
      color: faction.color,
      percent
    }))
  }

  return world.factions.map((faction) => ({
    id: faction.id,
    label: faction.label,
    color: faction.color,
    percent: (100 * (world.factionFlowerCounts[faction.id] ?? 0)) / total
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
  primaryWeaponSignal.value = PRIMARY_WEAPONS[world.player.primaryWeapon].name
  primaryWeaponIconSignal.value = PRIMARY_WEAPONS[world.player.primaryWeapon].icon
  primaryAmmoSignal.value = "∞"
  secondaryWeaponSignal.value = "Grenade"
  secondaryWeaponIconSignal.value = "G"
  secondaryWeaponCooldownSignal.value = "RMB to throw"
  hpSignal.value = { hp: world.player.hp, maxHp: world.player.maxHp }
  statusMessageSignal.value = "Click once to wake audio, then begin fighting"
  crosshairSignal.value = {
    x: canvas.clientWidth * 0.5,
    y: canvas.clientHeight * 0.5,
    visible: false
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
  primaryWeaponSignal.value = config.name
  primaryWeaponIconSignal.value = config.icon
  if (world.player.reloadCooldown > 0) {
    primaryAmmoSignal.value = "Reloading..."
    return
  }

  primaryAmmoSignal.value = Number.isFinite(world.player.primaryAmmo)
    ? `${Math.floor(world.player.primaryAmmo)} / ${Number.isFinite(world.player.reserveAmmo) ? Math.floor(world.player.reserveAmmo) : "∞"}`
    : "∞"
}

const updateSecondaryCooldownSignal = (world: WorldState) => {
  if (!world.player.secondaryCooldown) {
    secondaryWeaponCooldownSignal.value = "RMB to throw"
    return
  }

  secondaryWeaponCooldownSignal.value = `${Math.max(0, world.player.secondaryCooldown).toFixed(1)}s`
}

export const syncHudSignals = (world: WorldState) => {
  timeRemainingSignal.value = world.timeRemaining
  hpSignal.value = {
    hp: Math.round(world.player.hp),
    maxHp: Math.round(world.player.maxHp)
  }
  updatePlayerWeaponSignals(world)
  updateSecondaryCooldownSignal(world)
}

export const updatePlayerHpSignal = (world: WorldState) => {
  hpSignal.value = {
    hp: Math.round(world.player.hp),
    maxHp: Math.round(world.player.maxHp)
  }
}

export const setCrosshairSignal = (x: number, y: number, visible: boolean) => {
  crosshairSignal.value = {
    x,
    y,
    visible
  }
}

export const setSecondaryWeaponSignal = (mode: "grenade" | "molotov") => {
  secondaryWeaponSignal.value = mode === "grenade" ? "Grenade" : "Molotov"
  secondaryWeaponIconSignal.value = mode === "grenade" ? "G" : "M"
}

export const setStatusMessage = (message: string) => {
  statusMessageSignal.value = message
}

export const setPauseSignal = (paused: boolean) => {
  pausedSignal.value = paused
}

export const setMatchResultSignal = (
  winner: { label: string; color: string },
  slices: { color: string; percent: number }[],
  stats: { label: string; value: string }[],
  standings: { id: string; label: string; color: string; flowers: number; percent: number }[]
) => {
  matchResultSignal.value = {
    visible: true,
    winnerLabel: winner.label,
    winnerColor: winner.color,
    pieGradient: buildPieGradient(slices),
    stats,
    standings
  }
}
  
export const clearMatchResultSignal = () => {
  matchResultSignal.value = defaultMatchResult
}
