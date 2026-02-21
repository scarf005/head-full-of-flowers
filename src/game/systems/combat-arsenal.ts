import { sample } from "@std/random"

import type { PrimaryWeaponId } from "../types.ts"
import { LOOTABLE_PRIMARY_IDS, pickupAmmoForWeapon, PRIMARY_WEAPONS } from "../weapons.ts"
import type { PrimaryWeaponSlot, Unit } from "../entities.ts"
import type { WorldState } from "../world/state.ts"

export const randomLootablePrimary = (): PrimaryWeaponId => {
  return (sample(LOOTABLE_PRIMARY_IDS) as PrimaryWeaponId | undefined) ?? "assault"
}

const PRIMARY_WEAPON_CAP = 2
const PRIMARY_RESERVE_PICKUP_CAP = 3

export const getUnitById = (world: WorldState, unitId: string) => {
  return world.unitById.get(unitId) ?? world.units.find((candidate) => candidate.id === unitId)
}

export const resetBurstState = (unit: Unit) => {
  unit.burstShotsRemaining = 0
  unit.burstTotalShots = 0
  unit.burstShotIndex = 0
  unit.burstSpread = 0
  unit.burstInterval = 0
  unit.burstWeaponId = null
}

const totalAmmoCapForWeapon = (weaponId: PrimaryWeaponId) => {
  const weapon = PRIMARY_WEAPONS[weaponId]
  const magazineSize = weapon.magazineSize
  if (!Number.isFinite(magazineSize) || magazineSize <= 0) {
    return Number.POSITIVE_INFINITY
  }

  const magazinesPerPickup = Number.isFinite(weapon.pickupMagazineBundle)
    ? Math.max(1, Math.floor(weapon.pickupMagazineBundle))
    : 1
  return magazinesPerPickup * PRIMARY_RESERVE_PICKUP_CAP * magazineSize
}

const buildPrimarySlot = (weaponId: PrimaryWeaponId, ammo: number, acquiredAt: number): PrimaryWeaponSlot => {
  const config = PRIMARY_WEAPONS[weaponId]
  const normalizedAmmo = Number.isFinite(ammo) ? Math.max(0, ammo) : pickupAmmoForWeapon(weaponId)

  if (!Number.isFinite(config.magazineSize) || !Number.isFinite(normalizedAmmo)) {
    return {
      weaponId,
      primaryAmmo: Number.POSITIVE_INFINITY,
      reserveAmmo: Number.POSITIVE_INFINITY,
      magazineSize: config.magazineSize,
      acquiredAt,
    }
  }

  const loaded = Math.min(config.magazineSize, normalizedAmmo)
  const reserveCap = Math.max(0, totalAmmoCapForWeapon(weaponId) - loaded)
  const reserve = Math.min(reserveCap, Math.max(0, normalizedAmmo - loaded))

  return {
    weaponId,
    primaryAmmo: loaded,
    reserveAmmo: reserve,
    magazineSize: config.magazineSize,
    acquiredAt,
  }
}

export const syncUnitPrimaryFromSlot = (unit: Unit) => {
  if (unit.primarySlots.length === 0) {
    const pistol = buildPrimarySlot("pistol", Number.POSITIVE_INFINITY, ++unit.primarySlotSequence)
    unit.primarySlots.push(pistol)
    unit.primarySlotIndex = 0
  }

  if (unit.primarySlots.length === 1 && unit.primarySlots[0].weaponId !== "pistol") {
    const fallbackPistol = buildPrimarySlot("pistol", Number.POSITIVE_INFINITY, 0)
    unit.primarySlots.push(fallbackPistol)
  }

  if (unit.primarySlotIndex < 0 || unit.primarySlotIndex >= unit.primarySlots.length) {
    unit.primarySlotIndex = 0
  }

  const slot = unit.primarySlots[unit.primarySlotIndex]
  unit.primaryWeapon = slot.weaponId
  unit.primaryAmmo = slot.primaryAmmo
  unit.reserveAmmo = slot.reserveAmmo
  unit.magazineSize = slot.magazineSize
}

export const activePrimarySlot = (unit: Unit) => {
  syncUnitPrimaryFromSlot(unit)
  return unit.primarySlots[unit.primarySlotIndex]
}

const hasUsableAmmo = (slot: PrimaryWeaponSlot) => {
  if (!Number.isFinite(slot.primaryAmmo) || slot.primaryAmmo > 0) {
    return true
  }

  return !Number.isFinite(slot.reserveAmmo) || slot.reserveAmmo > 0
}

const isDepletedSlot = (slot: PrimaryWeaponSlot) => {
  return slot.weaponId !== "pistol" &&
    Number.isFinite(slot.primaryAmmo) &&
    slot.primaryAmmo <= 0 &&
    Number.isFinite(slot.reserveAmmo) &&
    slot.reserveAmmo <= 0
}

export const pruneDepletedPrimarySlots = (unit: Unit) => {
  const previousIndex = unit.primarySlotIndex
  let removed = false
  let removedBeforeActive = 0

  for (let index = unit.primarySlots.length - 1; index >= 0; index -= 1) {
    if (!isDepletedSlot(unit.primarySlots[index])) {
      continue
    }

    removed = true
    if (index < previousIndex) {
      removedBeforeActive += 1
    }
    unit.primarySlots.splice(index, 1)
  }

  if (!removed) {
    return false
  }

  if (unit.primarySlots.length <= 0) {
    unit.primarySlotIndex = 0
    return true
  }

  const adjustedIndex = previousIndex - removedBeforeActive
  unit.primarySlotIndex = Math.max(0, Math.min(adjustedIndex, unit.primarySlots.length - 1))
  return true
}

const ensureFallbackPistol = (unit: Unit) => {
  const pistolIndex = unit.primarySlots.findIndex((slot) => slot.weaponId === "pistol")
  if (pistolIndex >= 0) {
    unit.primarySlotIndex = pistolIndex
    syncUnitPrimaryFromSlot(unit)
    return
  }

  const pistolSlot = buildPrimarySlot("pistol", Number.POSITIVE_INFINITY, ++unit.primarySlotSequence)
  if (unit.primarySlots.length < PRIMARY_WEAPON_CAP) {
    unit.primarySlots.push(pistolSlot)
    unit.primarySlotIndex = unit.primarySlots.length - 1
  } else {
    unit.primarySlots[unit.primarySlotIndex] = pistolSlot
  }

  syncUnitPrimaryFromSlot(unit)
}

export const swapToUsablePrimaryIfNeeded = (shooter: Unit, onPrimaryWeaponChanged?: (unitId: string) => void) => {
  const current = activePrimarySlot(shooter)
  if (hasUsableAmmo(current)) {
    return
  }

  if (shooter.primarySlots.length > 1) {
    for (let offset = 1; offset < shooter.primarySlots.length; offset += 1) {
      const index = (shooter.primarySlotIndex + offset) % shooter.primarySlots.length
      if (!hasUsableAmmo(shooter.primarySlots[index])) {
        continue
      }

      shooter.primarySlotIndex = index
      shooter.reloadCooldown = 0
      shooter.reloadCooldownMax = 0
      resetBurstState(shooter)
      syncUnitPrimaryFromSlot(shooter)
      if (onPrimaryWeaponChanged) {
        onPrimaryWeaponChanged(shooter.id)
      }
      return
    }
  }

  if (current.weaponId !== "pistol") {
    shooter.reloadCooldown = 0
    shooter.reloadCooldownMax = 0
    resetBurstState(shooter)
    ensureFallbackPistol(shooter)
    if (onPrimaryWeaponChanged) {
      onPrimaryWeaponChanged(shooter.id)
    }
  }
}

export const startReload = (
  unitId: string,
  world: WorldState,
  onPlayerReloading: () => void,
  onReloadStarted?: (unit: Unit) => void,
) => {
  const unit = getUnitById(world, unitId)
  if (!unit || unit.reloadCooldown > 0) {
    return
  }

  pruneDepletedPrimarySlots(unit)

  const slot = activePrimarySlot(unit)
  const weapon = PRIMARY_WEAPONS[slot.weaponId]
  if (!Number.isFinite(slot.primaryAmmo)) {
    return
  }

  const hasReserve = !Number.isFinite(slot.reserveAmmo) || slot.reserveAmmo > 0
  if (slot.primaryAmmo >= slot.magazineSize || !hasReserve) {
    return
  }

  if (weapon.reload <= 0) {
    return
  }

  resetBurstState(unit)
  const reloadSpeed = Math.max(0.05, unit.reloadSpeedMultiplier)
  const reloadTimeMultiplier = Math.max(0.1, unit.nextReloadTimeMultiplier)
  unit.reloadCooldown = weapon.reload * reloadTimeMultiplier / reloadSpeed
  unit.reloadCooldownMax = unit.reloadCooldown
  unit.nextReloadTimeMultiplier = 1
  onReloadStarted?.(unit)
  if (unit.isPlayer) {
    onPlayerReloading()
  }
}

export const finishReload = (unitId: string, world: WorldState, onPlayerWeaponUpdate: () => void) => {
  const unit = getUnitById(world, unitId)
  if (!unit) {
    return
  }

  if (!completeReload(unit, false)) {
    return
  }

  if (unit.isPlayer) {
    onPlayerWeaponUpdate()
  }
}

export const completeReload = (unit: Unit, allowInProgress: boolean) => {
  if (unit.reloadCooldownMax <= 0) {
    return false
  }

  if (!allowInProgress && unit.reloadCooldown > 0) {
    return false
  }

  pruneDepletedPrimarySlots(unit)

  const slot = activePrimarySlot(unit)
  if (!Number.isFinite(slot.primaryAmmo)) {
    unit.reloadCooldown = 0
    unit.reloadCooldownMax = 0
    return false
  }

  const room = Math.max(0, slot.magazineSize - slot.primaryAmmo)
  if (room <= 0) {
    unit.reloadCooldown = 0
    unit.reloadCooldownMax = 0
    return false
  }

  if (Number.isFinite(slot.reserveAmmo) && slot.reserveAmmo <= 0) {
    unit.reloadCooldown = 0
    unit.reloadCooldownMax = 0
    return false
  }

  const moved = Number.isFinite(slot.reserveAmmo) ? Math.min(room, slot.reserveAmmo) : room
  slot.primaryAmmo += moved
  if (Number.isFinite(slot.reserveAmmo)) {
    slot.reserveAmmo -= moved
  }
  unit.reloadCooldown = 0
  unit.reloadCooldownMax = 0
  syncUnitPrimaryFromSlot(unit)
  return true
}

export const equipPrimary = (
  unitId: string,
  world: WorldState,
  weaponId: PrimaryWeaponId,
  ammo: number,
  onPlayerWeaponUpdate: () => void,
): PrimaryWeaponId | null => {
  const unit = getUnitById(world, unitId)
  if (!unit) {
    return null
  }

  resetBurstState(unit)

  syncUnitPrimaryFromSlot(unit)
  pruneDepletedPrimarySlots(unit)
  syncUnitPrimaryFromSlot(unit)
  const hadOnlyFallbackPistol = unit.primarySlots.length === 1 && unit.primarySlots[0].weaponId === "pistol"
  let ejectedWeaponId: PrimaryWeaponId | null = null
  const existingIndex = unit.primarySlots.findIndex((slot) => slot.weaponId === weaponId)
  if (existingIndex >= 0) {
    const existing = unit.primarySlots[existingIndex]
    if (!Number.isFinite(existing.reserveAmmo)) {
      syncUnitPrimaryFromSlot(unit)
      if (unit.isPlayer) {
        onPlayerWeaponUpdate()
      }
      return null
    }

    const pickedAmmo = Number.isFinite(ammo) ? Math.max(0, ammo) : pickupAmmoForWeapon(weaponId)
    if (!Number.isFinite(pickedAmmo)) {
      existing.reserveAmmo = Number.POSITIVE_INFINITY
    } else {
      const reserveCap = Math.max(0, totalAmmoCapForWeapon(weaponId) - existing.primaryAmmo)
      existing.reserveAmmo = Math.min(reserveCap, existing.reserveAmmo + pickedAmmo)
    }

    if (weaponId !== "pistol" && hadOnlyFallbackPistol) {
      unit.primarySlotIndex = existingIndex
    }
  } else {
    const newSlot = buildPrimarySlot(weaponId, ammo, ++unit.primarySlotSequence)

    if (unit.primarySlots.length < PRIMARY_WEAPON_CAP) {
      unit.primarySlots.push(newSlot)
      unit.primarySlotIndex = unit.primarySlots.length - 1
    } else {
      let oldestIndex = 0
      for (let index = 1; index < unit.primarySlots.length; index += 1) {
        if (unit.primarySlots[index].acquiredAt < unit.primarySlots[oldestIndex].acquiredAt) {
          oldestIndex = index
        }
      }

      const replacedWeaponId = unit.primarySlots[oldestIndex].weaponId
      if (replacedWeaponId !== "pistol") {
        ejectedWeaponId = replacedWeaponId
      }
      unit.primarySlots[oldestIndex] = newSlot
      unit.primarySlotIndex = oldestIndex
    }

    unit.reloadCooldown = 0
    unit.reloadCooldownMax = 0
  }

  syncUnitPrimaryFromSlot(unit)
  if (unit.isPlayer) {
    onPlayerWeaponUpdate()
  }

  return ejectedWeaponId
}

export const cyclePrimaryWeapon = (
  unitId: string,
  world: WorldState,
  direction: number,
  onPlayerWeaponUpdate: () => void,
) => {
  const unit = getUnitById(world, unitId)
  if (!unit) {
    return
  }

  pruneDepletedPrimarySlots(unit)
  syncUnitPrimaryFromSlot(unit)
  if (unit.primarySlots.length <= 1) {
    return
  }

  const step = direction >= 0 ? 1 : -1
  const slotCount = unit.primarySlots.length
  unit.primarySlotIndex = (unit.primarySlotIndex + step + slotCount) % slotCount
  unit.reloadCooldown = 0
  unit.reloadCooldownMax = 0
  resetBurstState(unit)
  syncUnitPrimaryFromSlot(unit)

  if (unit.isPlayer) {
    onPlayerWeaponUpdate()
  }
}
