import { clamp } from "./utils.ts"
import {
  debugEquipAllRocketLauncherSignal,
  debugImpactFeelLevelSignal,
  debugInfiniteReloadSignal,
  debugSkipToMatchEndSignal,
} from "./signals.ts"
import { pickupAmmoForWeapon } from "./weapons.ts"
import type { FlowerArenaGame } from "./game.ts"

export function applyDebugOverridesForGame(game: FlowerArenaGame) {
  game.world.impactFeelLevel = clamp(debugImpactFeelLevelSignal.value, 1, 2)

  if (debugEquipAllRocketLauncherSignal.value) {
    for (const unit of game.world.units) {
      if (unit.primaryWeapon === "rocket-launcher") {
        continue
      }

      game.equipPrimary(unit.id, "rocket-launcher", pickupAmmoForWeapon("rocket-launcher"))
    }
  }

  if (debugInfiniteReloadSignal.value) {
    const player = game.world.player

    player.reloadCooldown = 0
    player.reloadCooldownMax = 0

    for (const slot of player.primarySlots) {
      if (!Number.isFinite(slot.magazineSize) || !Number.isFinite(slot.primaryAmmo)) {
        slot.primaryAmmo = Number.POSITIVE_INFINITY
        slot.reserveAmmo = Number.POSITIVE_INFINITY
        continue
      }

      slot.primaryAmmo = slot.magazineSize
      slot.reserveAmmo = Number.POSITIVE_INFINITY
    }

    const activeSlot = player.primarySlots[player.primarySlotIndex]
    if (activeSlot) {
      player.primaryWeapon = activeSlot.weaponId
      player.primaryAmmo = activeSlot.primaryAmmo
      player.reserveAmmo = activeSlot.reserveAmmo
      player.magazineSize = activeSlot.magazineSize
    }
  }

  if (!game.world.running || game.world.finished) {
    debugSkipToMatchEndSignal.value = false
    return
  }

  if (debugSkipToMatchEndSignal.value) {
    game.world.timeRemaining = 0
    debugSkipToMatchEndSignal.value = false
  }
}
