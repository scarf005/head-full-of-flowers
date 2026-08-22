import type { PrimaryWeaponId } from "./types.ts"

const assaultMagazineSprite = new URL("../assets/items/assault-magazine.png", import.meta.url).href
const assaultSprite = new URL("../assets/items/assault.png", import.meta.url).href
const assaultUnloadedSprite = new URL("../assets/items/assault-unloaded.png", import.meta.url).href
const autoShotgunSprite = new URL("../assets/items/auto-shotgun.png", import.meta.url).href
const battleRifleMagazineSprite = new URL("../assets/items/battle-rifle-magazine.png", import.meta.url).href
const battleRifleSprite = new URL("../assets/items/battle-rifle.png", import.meta.url).href
const battleRifleUnloadedSprite = new URL("../assets/items/battle-rifle-unloaded.png", import.meta.url).href
const flamethrowerMagazineSprite = new URL("../assets/items/flamethrower-magazine.png", import.meta.url).href
const flamethrowerSprite = new URL("../assets/items/flamethrower.png", import.meta.url).href
const flamethrowerUnloadedSprite = new URL("../assets/items/flamethrower-unloaded.png", import.meta.url).href
const grenadeLauncherSprite = new URL("../assets/items/grenade-launcher.png", import.meta.url).href
const pistolSprite = new URL("../assets/items/pistol.png", import.meta.url).href
const rocketLauncherMagazineSprite = new URL("../assets/items/rocket-launcher-magazine.png", import.meta.url).href
const rocketLauncherSprite = new URL("../assets/items/rocket-launcher.png", import.meta.url).href
const rocketLauncherUnloadedSprite = new URL("../assets/items/rocket-launcher-unloaded.png", import.meta.url).href
const shotgunSprite = new URL("../assets/items/shotgun.png", import.meta.url).href

export type WeaponSpriteMode = "default" | "unloaded" | "magazine"

export interface WeaponSpriteConfig {
  default: string
  unloaded?: string
  magazine?: string
}

export interface WeaponSfxConfig {
  url: string
  volume: number
}

export interface PrimaryWeaponConfig {
  id: PrimaryWeaponId
  name: string
  icon: PrimaryWeaponId
  color: string
  sprite: WeaponSpriteConfig
  sfx?: WeaponSfxConfig
  cooldown: number
  damage: number
  speed: number
  range: number
  spread: number
  pellets: number
  bulletRadius: number
  projectileKind: "ballistic" | "flame" | "grenade" | "rocket"
  projectileAcceleration?: number
  burstShots?: number
  burstSpread?: number
  burstInterval?: number
  firingKnockback: number
  shellEjectionSpeed?: number
  shotgunRicochetCount?: number
  pickupMagazineBundle: number
  magazineSize: number
  reload: number
}

export type PrimaryWeaponKind =
  | "sidearm"
  | "rifle"
  | "shotgun"
  | "flame"
  | "grenade-launcher"
  | "rocket-launcher"

export const PRIMARY_WEAPON_KINDS: Record<PrimaryWeaponId, PrimaryWeaponKind> = {
  pistol: "sidearm",
  assault: "rifle",
  shotgun: "shotgun",
  flamethrower: "flame",
  "auto-shotgun": "shotgun",
  "battle-rifle": "rifle",
  "grenade-launcher": "grenade-launcher",
  "rocket-launcher": "rocket-launcher",
}

export const PRIMARY_WEAPON_TIERS: Record<PrimaryWeaponId, number> = {
  pistol: 0,
  assault: 1,
  shotgun: 1,
  flamethrower: 1,
  "auto-shotgun": 2,
  "battle-rifle": 2,
  "grenade-launcher": 2,
  "rocket-launcher": 2,
}

export const PRIMARY_WEAPONS: Record<PrimaryWeaponId, PrimaryWeaponConfig> = {
  pistol: {
    id: "pistol",
    name: "Pistol",
    icon: "pistol",
    color: "#f9e8a8",
    sprite: { default: pistolSprite },
    cooldown: 0.22,
    damage: 2,
    speed: 42,
    range: 28,
    spread: 0.045,
    pellets: 1,
    bulletRadius: 0.24,
    projectileKind: "ballistic",
    firingKnockback: 12,
    shellEjectionSpeed: 5.2,
    pickupMagazineBundle: Infinity,
    magazineSize: 8,
    reload: 0.75,
  },
  assault: {
    id: "assault",
    name: "Assault Rifle",
    icon: "assault",
    color: "#ffd67a",
    sprite: { default: assaultSprite, unloaded: assaultUnloadedSprite, magazine: assaultMagazineSprite },
    cooldown: 0.1,
    damage: 3,
    speed: 50,
    range: 30,
    spread: 0.085,
    pellets: 1,
    bulletRadius: 0.24,
    projectileKind: "ballistic",
    firingKnockback: 14,
    shellEjectionSpeed: 6.4,
    pickupMagazineBundle: 2,
    magazineSize: 30,
    reload: 0.6,
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    icon: "shotgun",
    color: "#ffc36f",
    sprite: { default: shotgunSprite },
    cooldown: 0.5,
    damage: 2,
    speed: 38,
    range: 16,
    spread: 0.3,
    pellets: 8,
    bulletRadius: 0.26,
    projectileKind: "ballistic",
    firingKnockback: 44,
    shellEjectionSpeed: 7.6,
    shotgunRicochetCount: 5,
    pickupMagazineBundle: 2,
    magazineSize: 6,
    reload: 0.8,
  },
  flamethrower: {
    id: "flamethrower",
    name: "Flamethrower",
    icon: "flamethrower",
    color: "#ffab5d",
    sprite: { default: flamethrowerSprite, unloaded: flamethrowerUnloadedSprite, magazine: flamethrowerMagazineSprite },
    cooldown: 0.06,
    damage: 4,
    speed: 24,
    range: 11,
    spread: 0.33,
    pellets: 1,
    bulletRadius: 0.18,
    projectileKind: "flame",
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
    sprite: { default: autoShotgunSprite },
    cooldown: 0.16,
    damage: 2,
    speed: 38,
    range: 14,
    spread: 0.35,
    pellets: 8,
    bulletRadius: 0.25,
    projectileKind: "ballistic",
    firingKnockback: 40,
    shellEjectionSpeed: 5.2,
    shotgunRicochetCount: 5,
    pickupMagazineBundle: 2,
    magazineSize: 6,
    reload: 0.78,
  },
  "battle-rifle": {
    id: "battle-rifle",
    name: "Battle Rifle",
    icon: "battle-rifle",
    color: "#ffd37f",
    sprite: { default: battleRifleSprite, unloaded: battleRifleUnloadedSprite, magazine: battleRifleMagazineSprite },
    cooldown: 0.2,
    damage: 4,
    speed: 52,
    range: 33,
    spread: 0.1,
    pellets: 1,
    bulletRadius: 0.24,
    projectileKind: "ballistic",
    burstShots: 3,
    burstSpread: 0.028,
    burstInterval: 0.06,
    firingKnockback: 20,
    shellEjectionSpeed: 5.2,
    pickupMagazineBundle: 2,
    magazineSize: 20,
    reload: 1,
  },
  "grenade-launcher": {
    id: "grenade-launcher",
    name: "Grenade Launcher",
    icon: "grenade-launcher",
    color: "#ffe48a",
    sprite: { default: grenadeLauncherSprite },
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
    sprite: {
      default: rocketLauncherSprite,
      unloaded: rocketLauncherUnloadedSprite,
      magazine: rocketLauncherMagazineSprite,
    },
    cooldown: 0.66,
    damage: 20,
    speed: 20,
    range: 24,
    spread: 0.012,
    pellets: 1,
    bulletRadius: 0.38,
    projectileKind: "rocket",
    projectileAcceleration: 150,
    firingKnockback: 60,
    pickupMagazineBundle: 3,
    magazineSize: 1,
    reload: 1.5,
  },
}

export const LOOTABLE_PRIMARY_IDS: PrimaryWeaponId[] = ["assault", "shotgun", "flamethrower"]
export const HIGH_TIER_PRIMARY_IDS: PrimaryWeaponId[] = [
  "auto-shotgun",
  "battle-rifle",
  "grenade-launcher",
  "rocket-launcher",
]

export const SECONDARY_WEAPON_COOLDOWNS = {
  grenade: 2.8,
  molotov: 4.4,
} as const
