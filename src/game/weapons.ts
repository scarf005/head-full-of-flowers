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
  pickupAmmo: number
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
    pickupAmmo: Infinity,
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
    pickupAmmo: 80,
    magazineSize: 20,
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
    pickupAmmo: 36,
    magazineSize: 6,
    reload: 0.8,
  },
  flamethrower: {
    id: "flamethrower",
    name: "Flamethrower",
    icon: "flamethrower",
    color: "#ffab5d",
    cooldown: 0.06,
    damage: 1,
    speed: 24,
    range: 11,
    spread: 0.33,
    pellets: 1,
    bulletRadius: 0.18,
    pickupAmmo: 180,
    magazineSize: 45,
    reload: 0.9,
  },
}

export const LOOTABLE_PRIMARY_IDS: PrimaryWeaponId[] = ["assault", "shotgun", "flamethrower"]

export const GRENADE_COOLDOWN = 2.8
export const MOLOTOV_COOLDOWN = 4.4
