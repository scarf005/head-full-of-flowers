import type { PrimaryWeaponId } from "./types.ts"

export interface PrimaryWeaponConfig {
  id: PrimaryWeaponId
  name: string
  icon: string
  cooldown: number
  damage: number
  speed: number
  range: number
  spread: number
  pellets: number
  bulletRadius: number
  pickupAmmo: number
}

export const PRIMARY_WEAPONS: Record<PrimaryWeaponId, PrimaryWeaponConfig> = {
  pistol: {
    id: "pistol",
    name: "Pistol",
    icon: "P",
    cooldown: 0.22,
    damage: 18,
    speed: 1120,
    range: 620,
    spread: 0.045,
    pellets: 1,
    bulletRadius: 6,
    pickupAmmo: Number.POSITIVE_INFINITY
  },
  assault: {
    id: "assault",
    name: "Assault Rifle",
    icon: "AR",
    cooldown: 0.1,
    damage: 11,
    speed: 1260,
    range: 700,
    spread: 0.085,
    pellets: 1,
    bulletRadius: 6,
    pickupAmmo: 96
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    icon: "SG",
    cooldown: 0.5,
    damage: 10,
    speed: 1020,
    range: 420,
    spread: 0.5,
    pellets: 6,
    bulletRadius: 7,
    pickupAmmo: 36
  },
  flamethrower: {
    id: "flamethrower",
    name: "Flamethrower",
    icon: "FT",
    cooldown: 0.06,
    damage: 4,
    speed: 720,
    range: 260,
    spread: 0.33,
    pellets: 1,
    bulletRadius: 5,
    pickupAmmo: 180
  }
}

export const LOOTABLE_PRIMARY_IDS: PrimaryWeaponId[] = ["assault", "shotgun", "flamethrower"]

export const GRENADE_COOLDOWN = 2.8
export const MOLOTOV_COOLDOWN = 4.4
