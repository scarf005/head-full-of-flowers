import {
  HIGH_TIER_PRIMARY_IDS,
  LOOTABLE_PRIMARY_IDS,
  PRIMARY_WEAPON_KINDS,
  PRIMARY_WEAPON_TIERS,
  PRIMARY_WEAPONS,
} from "./weapon-config.ts"
import type { PrimaryWeaponId } from "./types.ts"

export {
  HIGH_TIER_PRIMARY_IDS,
  LOOTABLE_PRIMARY_IDS,
  PRIMARY_WEAPON_KINDS,
  PRIMARY_WEAPON_TIERS,
  PRIMARY_WEAPONS,
} from "./weapon-config.ts"
export type {
  PrimaryWeaponConfig,
  PrimaryWeaponKind,
  WeaponSfxConfig,
  WeaponSpriteConfig,
  WeaponSpriteMode,
} from "./weapon-config.ts"

export const isHighTierPrimary = (weaponId: PrimaryWeaponId) => {
  return HIGH_TIER_PRIMARY_IDS.includes(weaponId)
}

export const primaryWeaponKind = (weaponId: PrimaryWeaponId) => {
  return PRIMARY_WEAPON_KINDS[weaponId]
}

export const primaryWeaponTier = (weaponId: PrimaryWeaponId) => {
  return PRIMARY_WEAPON_TIERS[weaponId]
}

export const pickupAmmoForWeapon = (weaponId: PrimaryWeaponId) => {
  const weapon = PRIMARY_WEAPONS[weaponId]
  if (!Number.isFinite(weapon.pickupMagazineBundle) || !Number.isFinite(weapon.magazineSize)) {
    return Number.POSITIVE_INFINITY
  }

  return Math.max(0, weapon.magazineSize * weapon.pickupMagazineBundle)
}
