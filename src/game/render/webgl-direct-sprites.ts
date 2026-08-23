import { PRIMARY_WEAPONS, type WeaponSpriteMode } from "../weapon-config.ts"
import type { PerkId, PrimaryWeaponId } from "../types.ts"

import grenadeSpriteUrl from "../../assets/items/grenade.png"
import molotovSpriteUrl from "../../assets/items/molotov.png"
import laserSightSprite from "../../assets/perks/laser-sight.png"
import ricochetShellsSprite from "../../assets/perks/ricochet-shells.png"
import contactGrenadesSprite from "../../assets/perks/contact-grenades.png"
import rapidReloadSprite from "../../assets/perks/rapid-reload.png"
import killReloadSprite from "../../assets/perks/kill-reload.png"
import heavyPelletsSprite from "../../assets/perks/heavy-pellets.png"
import vitalBloomSprite from "../../assets/perks/vital-bloom.png"
import quickstepSprite from "../../assets/perks/quickstep.png"
import kevlarVestSprite from "../../assets/perks/kevlar-vest.png"
import grassBaseTextureUrl from "../../assets/tiles/grass-base-24.png"
import grassDarkTextureUrl from "../../assets/tiles/grass-dark-24.png"
import grassTransitionsTextureUrl from "../../assets/tiles/grass-transitions-24.png"
import flowerPetalMaskUrl from "../../assets/flowers/flower-petal-mask.png"
import flowerAccentMaskUrl from "../../assets/flowers/flower-accent-mask.png"

export const ITEM_SPRITE_UNIT = 8
export const ITEM_WORLD_SCALE = 0.75
export const LOOT_SPRITE_SIZE = 0.15
export const GROUND_BASE_SPRITE = "ground:base"
export const GROUND_DARK_SPRITE = "ground:dark"
export const GROUND_TRANSITIONS_SPRITE = "ground:transitions"
export const FLOWER_PETAL_SPRITE = "flower:petal"
export const FLOWER_ACCENT_SPRITE = "flower:accent"

const spriteUrls = new Map<string, string>([
  ["grenade", grenadeSpriteUrl],
  ["molotov", molotovSpriteUrl],
  ["laser_sight", laserSightSprite],
  ["ricochet_shells", ricochetShellsSprite],
  ["proximity_grenades", contactGrenadesSprite],
  ["rapid_reload", rapidReloadSprite],
  ["kill_reload", killReloadSprite],
  ["heavy_pellets", heavyPelletsSprite],
  ["extra_heart", vitalBloomSprite],
  ["extra_stamina", quickstepSprite],
  ["kevlar_vest", kevlarVestSprite],
  [GROUND_BASE_SPRITE, grassBaseTextureUrl],
  [GROUND_DARK_SPRITE, grassDarkTextureUrl],
  [GROUND_TRANSITIONS_SPRITE, grassTransitionsTextureUrl],
  [FLOWER_PETAL_SPRITE, flowerPetalMaskUrl],
  [FLOWER_ACCENT_SPRITE, flowerAccentMaskUrl],
])

for (const weapon of Object.values(PRIMARY_WEAPONS)) {
  spriteUrls.set(weapon.id, weapon.sprite.default)
  if (weapon.sprite.unloaded) spriteUrls.set(`${weapon.id}-unloaded`, weapon.sprite.unloaded)
  if (weapon.sprite.magazine) spriteUrls.set(`${weapon.id}-magazine`, weapon.sprite.magazine)
}

const legacyAlias = new Map<string, string>([
  ["laser-sight", "laser_sight"],
  ["ricochet-shells", "ricochet_shells"],
  ["contact-grenades", "proximity_grenades"],
  ["rapid-reload", "rapid_reload"],
  ["heavy-pellets", "heavy_pellets"],
  ["vital-bloom", "extra_heart"],
  ["quickstep", "extra_stamina"],
  ["iron-bark", "kevlar_vest"],
])

const images = new Map<string, HTMLImageElement>()
let preloadPromise: Promise<void> | null = null

const canonicalId = (id: string) => legacyAlias.get(id) ?? id

const ensureImage = (id: string) => {
  const canonical = canonicalId(id)
  const cached = images.get(canonical)
  if (cached) return cached
  const url = spriteUrls.get(canonical)
  if (!url || typeof Image === "undefined") return null
  const image = new Image()
  image.src = url
  images.set(canonical, image)
  return image
}

const waitReady = (image: HTMLImageElement) => {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => {
      image.removeEventListener("load", done)
      image.removeEventListener("error", done)
      resolve()
    }
    image.addEventListener("load", done)
    image.addEventListener("error", done)
  })
}

export const preloadWebGLSprites = () => {
  if (preloadPromise) return preloadPromise
  preloadPromise = Promise.all([...spriteUrls.keys()].map((id) => {
    const image = ensureImage(id)
    return image ? waitReady(image) : Promise.resolve()
  })).then(() => undefined)
  return preloadPromise
}

export interface LoadedWebGLSprite {
  id: string
  image: HTMLImageElement
}

export const loadedWebGLSprites = (): LoadedWebGLSprite[] => {
  const result: LoadedWebGLSprite[] = []
  for (const id of spriteUrls.keys()) {
    const image = ensureImage(id)
    if (image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      result.push({ id, image })
    }
  }
  return result
}

export const hasWebGLSprite = (id: string) => spriteUrls.has(canonicalId(id))
export const canonicalWebGLSpriteId = canonicalId

export const resolveWeaponSpriteId = (
  weaponId: PrimaryWeaponId,
  mode: WeaponSpriteMode = "default",
) => mode === "default" || !PRIMARY_WEAPONS[weaponId].sprite[mode] ? weaponId : `${weaponId}-${mode}`

export const itemSpriteHeight = (size: number) => ITEM_SPRITE_UNIT * size * (size < 1 ? ITEM_WORLD_SCALE : 1)

export const perkSpriteId = (perkId: PerkId | null) => perkId ?? ""
