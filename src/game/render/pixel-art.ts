import { PRIMARY_WEAPONS, type WeaponSpriteMode } from "../weapon-config.ts"
import type { PerkId, PrimaryWeaponId } from "../types.ts"
import fireSpriteUrl from "../../assets/items/fire.png"
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

export type ItemSpriteId = PrimaryWeaponId | "grenade" | "molotov" | PerkId
const ITEM_SPRITE_UNIT = 8
const ITEM_WORLD_SCALE = 0.75
const LOOT_SPRITE_SIZE = 0.15
const itemSpritePath: Record<string, string> = {
  fire: fireSpriteUrl,
  grenade: grenadeSpriteUrl,
  molotov: molotovSpriteUrl,
  laser_sight: laserSightSprite,
  ricochet_shells: ricochetShellsSprite,
  proximity_grenades: contactGrenadesSprite,
  rapid_reload: rapidReloadSprite,
  kill_reload: killReloadSprite,
  heavy_pellets: heavyPelletsSprite,
  extra_heart: vitalBloomSprite,
  extra_stamina: quickstepSprite,
  kevlar_vest: kevlarVestSprite,
}

const legacyPerkSpriteAlias: Record<string, PerkId> = {
  "laser-sight": "laser_sight",
  "ricochet-shells": "ricochet_shells",
  "contact-grenades": "proximity_grenades",
  "rapid-reload": "rapid_reload",
  "heavy-pellets": "heavy_pellets",
  "vital-bloom": "extra_heart",
  quickstep: "extra_stamina",
  "iron-bark": "kevlar_vest",
}

const weaponSpritePath = (id: string) => {
  const weapon = Object.values(PRIMARY_WEAPONS).find((candidate) => candidate.id === id)
  if (weapon) {
    return weapon.sprite.default
  }

  const weaponVariant = Object.values(PRIMARY_WEAPONS).find((candidate) => {
    return ["unloaded", "magazine"].some((mode) => `${candidate.id}-${mode}` === id)
  })
  if (!weaponVariant) {
    return undefined
  }

  const mode = id.slice(weaponVariant.id.length + 1) as Exclude<WeaponSpriteMode, "default">
  return weaponVariant.sprite[mode]
}

export const getItemSpritePath = (id: ItemSpriteId | string) => {
  const weaponSprite = weaponSpritePath(id)
  if (weaponSprite) {
    return weaponSprite
  }

  const direct = (itemSpritePath as Record<string, string | undefined>)[id]
  if (direct) {
    return direct
  }

  const alias = legacyPerkSpriteAlias[id]
  if (alias) {
    return itemSpritePath[alias]
  }

  return undefined
}

const itemSpriteCache = new Map<string, HTMLImageElement | null>()
let itemSpritePreloadPromise: Promise<void> | null = null

const itemSpriteIds = [
  ...Object.keys(PRIMARY_WEAPONS),
  ...Object.values(PRIMARY_WEAPONS).flatMap((weapon) => {
    return ["unloaded", "magazine"].flatMap((mode) =>
      weapon.sprite[mode as Exclude<WeaponSpriteMode, "default">] ? [`${weapon.id}-${mode}`] : []
    )
  }),
  ...Object.keys(itemSpritePath),
]

const ensureItemSprite = (id: ItemSpriteId | string) => {
  const cached = itemSpriteCache.get(id)
  if (cached !== undefined) {
    return cached
  }

  if (typeof Image === "undefined") {
    itemSpriteCache.set(id, null)
    return null
  }

  const spritePath = getItemSpritePath(id)
  if (!spritePath) {
    itemSpriteCache.set(id, null)
    return null
  }

  const image = new Image()
  image.src = spritePath
  itemSpriteCache.set(id, image)
  return image
}

const waitForSpriteReady = (image: HTMLImageElement) => {
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    const complete = () => {
      image.removeEventListener("load", complete)
      image.removeEventListener("error", complete)
      resolve()
    }

    image.addEventListener("load", complete)
    image.addEventListener("error", complete)
  })
}

export const preloadItemSprites = () => {
  if (itemSpritePreloadPromise) {
    return itemSpritePreloadPromise
  }

  itemSpritePreloadPromise = Promise
    .all(itemSpriteIds.map((id) => {
      const sprite = ensureItemSprite(id)
      if (!sprite) {
        return Promise.resolve()
      }

      return waitForSpriteReady(sprite)
    }))
    .then(() => undefined)

  return itemSpritePreloadPromise
}

const drawItemSpritePng = (
  context: CanvasRenderingContext2D,
  spriteId: ItemSpriteId | string,
  x: number,
  y: number,
  size: number,
  anchorX = 0.5,
) => {
  const image = ensureItemSprite(spriteId)
  if (!image || !image.complete || image.naturalWidth <= 0) {
    return false
  }

  const drawSize = ITEM_SPRITE_UNIT * size * (size < 1 ? ITEM_WORLD_SCALE : 1)
  const aspect = image.naturalWidth / image.naturalHeight
  const drawHeight = drawSize
  const drawWidth = drawHeight * aspect
  const clampedAnchorX = Math.max(0, Math.min(1, anchorX))
  const left = x - drawWidth * clampedAnchorX
  const halfHeight = drawHeight * 0.5
  const smoothBefore = context.imageSmoothingEnabled
  context.imageSmoothingEnabled = false
  context.drawImage(image, left, y - halfHeight, drawWidth, drawHeight)
  context.imageSmoothingEnabled = smoothBefore
  return true
}

const measureItemSpriteWorldWidth = (spriteId: ItemSpriteId, size: number) => {
  const drawSize = ITEM_SPRITE_UNIT * size * (size < 1 ? ITEM_WORLD_SCALE : 1)
  const image = ensureItemSprite(spriteId)
  if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return drawSize
  }

  return drawSize * (image.naturalWidth / image.naturalHeight)
}

export const getWeaponSpriteHalfLength = (weaponId: PrimaryWeaponId, size: number) => {
  return measureItemSpriteWorldWidth(weaponId, size) * 0.5
}

export const getWeaponSpriteVariantId = (weaponId: PrimaryWeaponId, mode: Exclude<WeaponSpriteMode, "default">) => {
  return PRIMARY_WEAPONS[weaponId].sprite[mode] ? `${weaponId}-${mode}` : null
}

export const scaleWeaponVariantToWeaponSize = (
  weaponId: PrimaryWeaponId,
  mode: Exclude<WeaponSpriteMode, "default">,
  weaponSize: number,
) => {
  const variantId = getWeaponSpriteVariantId(weaponId, mode)
  if (!variantId) {
    return null
  }

  const weaponSprite = ensureItemSprite(weaponId)
  const variantSprite = ensureItemSprite(variantId)
  if (
    !weaponSprite ||
    !variantSprite ||
    !weaponSprite.complete ||
    !variantSprite.complete ||
    weaponSprite.naturalHeight <= 0 ||
    variantSprite.naturalHeight <= 0
  ) {
    return null
  }

  return weaponSize * (variantSprite.naturalHeight / weaponSprite.naturalHeight)
}

const resolveWeaponSpriteId = (weaponId: PrimaryWeaponId, mode: WeaponSpriteMode) => {
  if (mode === "default") {
    return weaponId
  }

  return getWeaponSpriteVariantId(weaponId, mode) ?? weaponId
}

const drawItemSpriteFallback = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  anchorX = 0.5,
) => {
  const drawSize = ITEM_SPRITE_UNIT * size * (size < 1 ? ITEM_WORLD_SCALE : 1)
  const clampedAnchorX = Math.max(0, Math.min(1, anchorX))
  const left = x - drawSize * clampedAnchorX
  const centerX = left + drawSize * 0.5
  const half = drawSize * 0.5
  context.fillStyle = "rgba(243, 245, 240, 0.9)"
  context.beginPath()
  context.roundRect(left, y - half, drawSize, drawSize, drawSize * 0.18)
  context.fill()
  context.strokeStyle = "rgba(187, 47, 47, 0.9)"
  context.lineWidth = Math.max(0.02, drawSize * 0.18)
  context.beginPath()
  context.moveTo(centerX - half * 0.55, y)
  context.lineTo(centerX + half * 0.55, y)
  context.moveTo(centerX, y - half * 0.55)
  context.lineTo(centerX, y + half * 0.55)
  context.stroke()
}

export const drawWeaponPickupSprite = (
  context: CanvasRenderingContext2D,
  weaponId: PrimaryWeaponId,
  x: number,
  y: number,
  size = 0.1,
  anchorX = 0.5,
  mode: WeaponSpriteMode = "default",
) => {
  if (drawItemSpritePng(context, resolveWeaponSpriteId(weaponId, mode), x, y, size, anchorX)) {
    return
  }

  drawItemSpriteFallback(context, x, y, size, anchorX)
}

export const drawItemPickupSprite = (
  context: CanvasRenderingContext2D,
  spriteId: ItemSpriteId | string,
  x: number,
  y: number,
  size = LOOT_SPRITE_SIZE,
) => {
  if (drawItemSpritePng(context, spriteId, x, y, size)) {
    return
  }

  drawItemSpriteFallback(context, x, y, size)
}

export const drawGrenadeSprite = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 0.08,
) => {
  if (drawItemSpritePng(context, "grenade", x, y, size)) {
    return
  }

  drawItemSpriteFallback(context, x, y, size)
}

export const drawMolotovSprite = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 0.08,
) => {
  if (drawItemSpritePng(context, "molotov", x, y, size)) {
    return
  }

  drawItemSpriteFallback(context, x, y, size)
}

export const drawFlameProjectileSprite = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 0.14,
) => {
  drawItemSpritePng(context, "fire", x, y, size)
}
