import type { PrimaryWeaponId } from "./types.ts"

export interface PrimaryWeaponConfig {
  id: PrimaryWeaponId
  name: string
  icon: PrimaryWeaponId
  color: string
  cooldown: number
  damage: number
  speed: number
  range: number
  spread: number
  pellets: number
  bulletRadius: number
  projectileKind?: "ballistic" | "flame" | "grenade" | "rocket"
  burstShots?: number
  burstSpread?: number
  burstInterval?: number
  firingKnockback: number
  pickupMagazineBundle: number
  magazineSize: number
  reload: number
}

export const PRIMARY_WEAPONS: Record<PrimaryWeaponId, PrimaryWeaponConfig> = {
  pistol: {
    id: "pistol",
    name: "Pistol",
    icon: "pistol",
    color: "#f9e8a8",
    cooldown: 0.22,
    damage: 2,
    speed: 42,
    range: 28,
    spread: 0.045,
    pellets: 1,
    bulletRadius: 0.24,
    firingKnockback: 12,
    pickupMagazineBundle: Infinity,
    magazineSize: 8,
    reload: 0.75,
  },
  assault: {
    id: "assault",
    name: "Assault Rifle",
    icon: "assault",
    color: "#ffd67a",
    cooldown: 0.1,
    damage: 3,
    speed: 50,
    range: 30,
    spread: 0.085,
    pellets: 1,
    bulletRadius: 0.24,
    firingKnockback: 14,
    pickupMagazineBundle: 2,
    magazineSize: 30,
    reload: 0.6,
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    icon: "shotgun",
    color: "#ffc36f",
    cooldown: 0.5,
    damage: 2,
    speed: 38,
    range: 16,
    spread: 0.3,
    pellets: 8,
    bulletRadius: 0.26,
    firingKnockback: 44,
    pickupMagazineBundle: 2,
    magazineSize: 6,
    reload: 0.8,
  },
  flamethrower: {
    id: "flamethrower",
    name: "Flamethrower",
    icon: "flamethrower",
    color: "#ffab5d",
    cooldown: 0.06,
    damage: 4,
    speed: 24,
    range: 11,
    spread: 0.33,
    pellets: 1,
    bulletRadius: 0.18,
    firingKnockback: 8,
    pickupMagazineBundle: 2,
    magazineSize: 45,
    reload: 0.9,
  },
  "auto-shotgun": {
    id: "auto-shotgun",
    name: "Auto Shotgun",
    icon: "auto-shotgun",
    color: "#ffad67",
    cooldown: 0.16,
    damage: 2,
    speed: 38,
    range: 14,
    spread: 0.35,
    pellets: 8,
    bulletRadius: 0.25,
    firingKnockback: 40,
    pickupMagazineBundle: 2,
    magazineSize: 6,
    reload: 0.78,
  },
  "battle-rifle": {
    id: "battle-rifle",
    name: "Battle Rifle",
    icon: "battle-rifle",
    color: "#ffd37f",
    cooldown: 0.2,
    damage: 4,
    speed: 52,
    range: 33,
    spread: 0.1,
    pellets: 1,
    bulletRadius: 0.24,
    burstShots: 3,
    burstSpread: 0.028,
    burstInterval: 0.06,
    firingKnockback: 20,
    pickupMagazineBundle: 2,
    magazineSize: 20,
    reload: 1,
  },
  "grenade-launcher": {
    id: "grenade-launcher",
    name: "Grenade Launcher",
    icon: "grenade-launcher",
    color: "#ffe48a",
    cooldown: 0.7,
    damage: 20,
    speed: 40,
    range: 21,
    spread: 0.015,
    pellets: 1,
    bulletRadius: 0.34,
    projectileKind: "grenade",
    firingKnockback: 52,
    pickupMagazineBundle: 1,
    magazineSize: 6,
    reload: 1.5,
  },
  "rocket-launcher": {
    id: "rocket-launcher",
    name: "Rocket Launcher",
    icon: "rocket-launcher",
    color: "#ffab73",
    cooldown: 0.66,
    damage: 20,
    speed: 19,
    range: 24,
    spread: 0.012,
    pellets: 1,
    bulletRadius: 0.38,
    projectileKind: "rocket",
    firingKnockback: 60,
    pickupMagazineBundle: 3,
    magazineSize: 1,
    reload: 2,
  },
}

export const LOOTABLE_PRIMARY_IDS: PrimaryWeaponId[] = ["assault", "shotgun", "flamethrower"]
export const HIGH_TIER_PRIMARY_IDS: PrimaryWeaponId[] = [
  "auto-shotgun",
  "battle-rifle",
  "grenade-launcher",
  "rocket-launcher",
]

export const isHighTierPrimary = (weaponId: PrimaryWeaponId) => {
  return HIGH_TIER_PRIMARY_IDS.includes(weaponId)
}

export const pickupAmmoForWeapon = (weaponId: PrimaryWeaponId) => {
  const weapon = PRIMARY_WEAPONS[weaponId]
  if (!Number.isFinite(weapon.pickupMagazineBundle) || !Number.isFinite(weapon.magazineSize)) {
    return Number.POSITIVE_INFINITY
  }

  return Math.max(0, weapon.magazineSize * weapon.pickupMagazineBundle)
}

export const GRENADE_COOLDOWN = 2.8
export const MOLOTOV_COOLDOWN = 4.4
