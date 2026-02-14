import {
  blueCoverageSignal,
  crosshairSignal,
  hpSignal,
  perkOptionsSignal,
  primaryAmmoSignal,
  primaryWeaponSignal,
  secondaryWeaponSignal,
  statusMessageSignal,
  timeRemainingSignal,
  whiteCoverageSignal
} from "../signals.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import type { WorldState } from "../world/state.ts"

export const resetHudSignals = (world: WorldState, canvas: HTMLCanvasElement) => {
  timeRemainingSignal.value = 90
  whiteCoverageSignal.value = 50
  blueCoverageSignal.value = 50
  primaryWeaponSignal.value = PRIMARY_WEAPONS[world.player.primaryWeapon].name
  primaryAmmoSignal.value = "∞"
  secondaryWeaponSignal.value = "Grenade"
  hpSignal.value = { hp: world.player.hp, maxHp: world.player.maxHp }
  perkOptionsSignal.value = []
  statusMessageSignal.value = "Click once to wake audio, then fight from 50m down to 25m"
  crosshairSignal.value = {
    x: canvas.clientWidth * 0.5,
    y: canvas.clientHeight * 0.5,
    visible: false
  }
}

export const updateCoverageSignals = (world: WorldState) => {
  const total = world.whiteFlowers + world.blueFlowers
  if (total <= 0) {
    whiteCoverageSignal.value = 50
    blueCoverageSignal.value = 50
    return
  }

  const white = (world.whiteFlowers / total) * 100
  whiteCoverageSignal.value = white
  blueCoverageSignal.value = 100 - white
}

export const updatePlayerWeaponSignals = (world: WorldState) => {
  const config = PRIMARY_WEAPONS[world.player.primaryWeapon]
  primaryWeaponSignal.value = config.name
  if (world.player.reloadCooldown > 0) {
    primaryAmmoSignal.value = "Reloading..."
    return
  }

  primaryAmmoSignal.value = Number.isFinite(world.player.primaryAmmo)
    ? `${Math.floor(world.player.primaryAmmo)} / ${Math.floor(world.player.reserveAmmo)}`
    : "∞"
}

export const syncHudSignals = (world: WorldState) => {
  timeRemainingSignal.value = world.timeRemaining
  hpSignal.value = {
    hp: Math.round(world.player.hp),
    maxHp: Math.round(world.player.maxHp)
  }
  updatePlayerWeaponSignals(world)
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
}

export const setStatusMessage = (message: string) => {
  statusMessageSignal.value = message
}

export const clearPerkOptions = () => {
  perkOptionsSignal.value = []
}

export const setPerkOptions = (options: { id: string; name: string; description: string }[]) => {
  perkOptionsSignal.value = options
}
