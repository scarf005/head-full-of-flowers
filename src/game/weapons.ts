import type { PrimaryWeaponId } from "./types.ts"

export interface PrimaryWeaponConfig {
  id: PrimaryWeaponId
  name: string
  icon: string
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
    icon: "P",
    color: "#f9e8a8",
    cooldown: 0.22,
    damage: 2,
    speed: 42,
    range: 28,
    spread: 0.045,
    pellets: 1,
    bulletRadius: 0.24,
    pickupAmmo: Number.POSITIVE_INFINITY,
    magazineSize: Number.POSITIVE_INFINITY,
    reload: 0
  },
  assault: {
    id: "assault",
    name: "Assault Rifle",
    icon: "AR",
    color: "#ffd67a",
    cooldown: 0.1,
    damage: 2,
    speed: 47,
    range: 30,
    spread: 0.085,
    pellets: 1,
    bulletRadius: 0.22,
    pickupAmmo: 96,
    magazineSize: 24,
    reload: 1.2
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    icon: "SG",
    color: "#ffc36f",
    cooldown: 0.5,
    damage: 2,
    speed: 38,
    range: 16,
    spread: 0.42,
    pellets: 6,
    bulletRadius: 0.26,
    pickupAmmo: 36,
    magazineSize: 6,
    reload: 1.6
  },
  flamethrower: {
    id: "flamethrower",
    name: "Flamethrower",
    icon: "FT",
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
    reload: 1.8
  }
}

export const LOOTABLE_PRIMARY_IDS: PrimaryWeaponId[] = ["assault", "shotgun", "flamethrower"]

export const GRENADE_COOLDOWN = 2.8
export const MOLOTOV_COOLDOWN = 4.4
