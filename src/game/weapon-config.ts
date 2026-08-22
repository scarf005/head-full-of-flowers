import assaultMagazineSprite from "../assets/items/assault-magazine.png"
import assaultSprite from "../assets/items/assault.png"
import assaultUnloadedSprite from "../assets/items/assault-unloaded.png"
import autoShotgunSprite from "../assets/items/auto-shotgun.png"
import battleRifleMagazineSprite from "../assets/items/battle-rifle-magazine.png"
import battleRifleSprite from "../assets/items/battle-rifle.png"
import battleRifleUnloadedSprite from "../assets/items/battle-rifle-unloaded.png"
import flamethrowerMagazineSprite from "../assets/items/flamethrower-magazine.png"
import flamethrowerSprite from "../assets/items/flamethrower.png"
import flamethrowerUnloadedSprite from "../assets/items/flamethrower-unloaded.png"
import grenadeLauncherSprite from "../assets/items/grenade-launcher.png"
import pistolSprite from "../assets/items/pistol.png"
import rocketLauncherMagazineSprite from "../assets/items/rocket-launcher-magazine.png"
import rocketLauncherSprite from "../assets/items/rocket-launcher.png"
import rocketLauncherUnloadedSprite from "../assets/items/rocket-launcher-unloaded.png"
import shotgunSprite from "../assets/items/shotgun.png"
import autoShotgunSfx from "../assets/sfx/156904__duesto__spas-12.mp3"
import shotgunSfx from "../assets/sfx/159710__anthonychan0__mossberg-500a-1-shot-and-pump.mp3"
import grenadeLauncherSfx from "../assets/sfx/163458__lemudcrab__grenade-launcher.mp3"
import assaultSfx from "../assets/sfx/201668__franki-01234__m16-burst-in-street.mp3"
import battleRifleSfx from "../assets/sfx/702225__areniporgen__fn-scar-h.mp3"
import type { PrimaryWeaponId } from "./types.ts"

export type WeaponSpriteMode = "default" | "unloaded" | "magazine"

export interface WeaponSpriteConfig {
  default: string
  unloaded?: string
  magazine?: string
}

export interface WeaponSfxConfig {
  url: string
  volume: number
  continuous?: boolean
  stopAt?: number
  stopFadeDuration?: number
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
    sfx: { url: assaultSfx, volume: 0.48, continuous: true, stopAt: 2.1, stopFadeDuration: 0.1 },
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
    sfx: { url: shotgunSfx, volume: 0.58 },
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
    sfx: { url: autoShotgunSfx, volume: 0.52 },
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
    sfx: { url: battleRifleSfx, volume: 0.48, continuous: true, stopAt: 0.8, stopFadeDuration: 0.1 },
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
    sfx: { url: grenadeLauncherSfx, volume: 0.65 },
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
