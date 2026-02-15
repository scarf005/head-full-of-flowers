import {
  coverageSlicesSignal,
  crosshairSignal,
  fpsSignal,
  hpSignal,
  matchResultSignal,
  menuVisibleSignal,
  pausedSignal,
  playerPerksSignal,
  primaryAmmoSignal,
  primaryWeaponIconSignal,
  primaryWeaponSlotsSignal,
  primaryWeaponSignal,
  secondaryModeSignal,
  secondaryWeaponCooldownSignal,
  statusMessageSignal,
  timeRemainingSignal,
} from "../signals.ts"
import { BURNED_FACTION_COLOR, BURNED_FACTION_ID } from "../factions.ts"
import { PERK_POOL } from "../perks.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import { MATCH_DURATION_SECONDS } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"
import { t } from "@lingui/core/macro"
import type { PerkId, PrimaryWeaponId } from "../types.ts"

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
  if (weaponId === "auto-shotgun") {
    return t`Auto Shotgun`
  }
  if (weaponId === "battle-rifle") {
    return t`Battle Rifle`
  }
  if (weaponId === "grenade-launcher") {
    return t`Grenade Launcher`
  }
  if (weaponId === "rocket-launcher") {
    return t`Rocket Launcher`
  }

  return t`Flamethrower`
}

const formatAmmo = (primaryAmmo: number, reserveAmmo: number, reloading = false) => {
  if (reloading) {
    return t`Reloading...`
  }

  return Number.isFinite(primaryAmmo)
    ? `${Math.floor(primaryAmmo)} / ${Number.isFinite(reserveAmmo) ? Math.floor(reserveAmmo) : "∞"}`
    : "∞"
}

const localizePerk = (perkId: PerkId) => {
  if (perkId === "laser_sight") {
    return t`Laser Sight`
  }
  if (perkId === "ricochet_shells") {
    return t`Ricochet Shells`
  }
  if (perkId === "proximity_grenades") {
    return t`Proximity Grenades`
  }
  if (perkId === "rapid_reload") {
    return t`Rapid Reload`
  }
  if (perkId === "heavy_pellets") {
    return t`Heavy Pellets`
  }
  if (perkId === "extra_heart") {
    return t`Extra Heart`
  }
  if (perkId === "overpressure_rounds") {
    return t`Overpressure Rounds`
  }
  if (perkId === "extra_stamina") {
    return t`Extra Stamina`
  }

  return t`Kevlar Vest`
}

const localizePerkDetail = (perkId: PerkId, stacks: number) => {
  if (perkId === "laser_sight") {
    return t`Soft aim assist cone`
  }
  if (perkId === "ricochet_shells") {
    return t`Shotgun bounces x5`
  }
  if (perkId === "proximity_grenades") {
    return t`Grenades explode near enemies`
  }
  if (perkId === "rapid_reload") {
    return t`Reload speed +25%`
  }
  if (perkId === "heavy_pellets") {
    return t`Pellet size +50%, fire rate -25%`
  }
  if (perkId === "extra_heart") {
    return t`Max HP +${stacks * 3}`
  }
  if (perkId === "overpressure_rounds") {
    return t`Damage +15%, fire rate -8%`
  }
  if (perkId === "extra_stamina") {
    return t`Move speed +12%`
  }

  return t`Damage taken -1 (min 1)`
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
  primaryWeaponSlotsSignal.value = [{
    label: t`Pistol`,
    icon: "pistol",
    ammo: "∞",
    selected: true,
  }]
  secondaryModeSignal.value = "grenade"
  secondaryWeaponCooldownSignal.value = t`RMB to throw`
  hpSignal.value = { hp: world.player.hp, maxHp: world.player.maxHp }
  playerPerksSignal.value = []
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
  primaryAmmoSignal.value = formatAmmo(world.player.primaryAmmo, world.player.reserveAmmo, world.player.reloadCooldown > 0)

  const activeSlotIndex = Math.max(0, Math.min(world.player.primarySlotIndex, world.player.primarySlots.length - 1))
  const slots = world.player.primarySlots.length > 0
    ? world.player.primarySlots
    : [{
      weaponId: world.player.primaryWeapon,
      primaryAmmo: world.player.primaryAmmo,
      reserveAmmo: world.player.reserveAmmo,
      magazineSize: world.player.magazineSize,
      acquiredAt: 0,
    }]

  primaryWeaponSlotsSignal.value = slots.slice(0, 2).map((slot, index) => ({
    label: localizeWeapon(slot.weaponId),
    icon: PRIMARY_WEAPONS[slot.weaponId].icon,
    ammo: formatAmmo(slot.primaryAmmo, slot.reserveAmmo, world.player.reloadCooldown > 0 && index === activeSlotIndex),
    selected: index === activeSlotIndex,
  }))
}

const updatePlayerPerkSignals = (world: WorldState) => {
  const perks = PERK_POOL
    .map((perkId) => {
      const stacks = world.player.perkStacks[perkId] ?? 0
      if (stacks <= 0) {
        return null
      }

      return {
        id: perkId,
        label: localizePerk(perkId),
        detail: localizePerkDetail(perkId, stacks),
        icon: perkId,
        stacks,
      }
    })
    .filter((entry) => entry !== null)

  playerPerksSignal.value = perks
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
  updatePlayerPerkSignals(world)
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
