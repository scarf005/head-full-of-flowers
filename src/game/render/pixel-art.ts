import type { PrimaryWeaponId } from "../types.ts"

type SpriteRow = string
type ItemSpriteId = PrimaryWeaponId | "grenade" | "molotov"

const ITEM_SPRITE_UNIT = 8
const itemSpritePath: Record<ItemSpriteId, string> = {
  pistol: "/items/pistol.png",
  assault: "/items/assault.png",
  shotgun: "/items/shotgun.png",
  flamethrower: "/items/flamethrower.png",
  grenade: "/items/grenade.png",
  molotov: "/items/molotov.png"
}

const itemSpriteCache = new Map<ItemSpriteId, HTMLImageElement | null>()

const ensureItemSprite = (id: ItemSpriteId) => {
  const cached = itemSpriteCache.get(id)
  if (cached !== undefined) {
    return cached
  }

  if (typeof Image === "undefined") {
    itemSpriteCache.set(id, null)
    return null
  }

  const image = new Image()
  image.src = itemSpritePath[id]
  itemSpriteCache.set(id, image)
  return image
}

const drawItemSpritePng = (
  context: CanvasRenderingContext2D,
  spriteId: ItemSpriteId,
  x: number,
  y: number,
  size: number
) => {
  const image = ensureItemSprite(spriteId)
  if (!image || !image.complete || image.naturalWidth <= 0) {
    return false
  }

  const drawSize = ITEM_SPRITE_UNIT * size
  const half = drawSize * 0.5
  const smoothBefore = context.imageSmoothingEnabled
  context.imageSmoothingEnabled = false
  context.drawImage(image, x - half, y - half, drawSize, drawSize)
  context.imageSmoothingEnabled = smoothBefore
  return true
}

const palette = {
  k: "#1e1b22",
  m: "#5f6772",
  M: "#8e99a8",
  y: "#d4aa3a",
  G: "#6f8f4f",
  c: "#7ac7b8",
  C: "#b6f5e9",
  N: "#b59652",
  x: "#4a3a2a",
  X: "#7a5a3e",
  W: "#9b704a",
  r: "#8f3a2e"
}

const weaponSprites: Record<PrimaryWeaponId, SpriteRow[]> = {
  pistol: [
    "........",
    "..kk....",
    "..kMkk..",
    "..kMMk..",
    "...kMk..",
    "...kmy..",
    "....k...",
    "........"
  ],
  assault: [
    "........",
    ".kkk....",
    ".kMMkkkk",
    ".kMMMMMk",
    "..kMMkkk",
    "...ky...",
    "...k....",
    "........"
  ],
  shotgun: [
    "........",
    ".kkkk...",
    ".kMMMk..",
    ".kMMMMkk",
    "..kMMMk.",
    "...kWy..",
    "...k....",
    "........"
  ],
  flamethrower: [
    "........",
    "..cc....",
    ".ckCCk..",
    ".ckMMkkk",
    "..kMMMk.",
    "...kry..",
    "...k....",
    "........"
  ]
}

const grenadeSprite: SpriteRow[] = [
  "........",
  "...kk...",
  "..kGGk..",
  "..kGGk..",
  "..kGGk..",
  "...kkk..",
  "....k...",
  "........"
]

const molotovSprite: SpriteRow[] = [
  "...y....",
  "..yyy...",
  "...k....",
  "..krrk..",
  "..krMk..",
  "..krrk..",
  "...kk...",
  "........"
]

const flameProjectileSprite: SpriteRow[] = [
  "........",
  "...r....",
  "..rrr...",
  ".rCCyyr.",
  "..rCCr..",
  "...rr...",
  "....r...",
  "........"
]

const draw = (
  context: CanvasRenderingContext2D,
  sprite: SpriteRow[],
  x: number,
  y: number,
  pixelSize: number
) => {
  const size = sprite.length
  const half = (size * pixelSize) * 0.5
  for (let row = 0; row < size; row += 1) {
    const line = sprite[row]
    for (let col = 0; col < line.length; col += 1) {
      const key = line[col] as keyof typeof palette | "."
      if (key === ".") {
        continue
      }

      const color = palette[key]
      if (!color) {
        continue
      }

      context.fillStyle = color
      context.fillRect(
        x - half + col * pixelSize,
        y - half + row * pixelSize,
        pixelSize,
        pixelSize
      )
    }
  }
}

export const drawWeaponPickupSprite = (
  context: CanvasRenderingContext2D,
  weaponId: PrimaryWeaponId,
  x: number,
  y: number,
  size = 0.1
) => {
  if (drawItemSpritePng(context, weaponId, x, y, size)) {
    return
  }

  draw(context, weaponSprites[weaponId], x, y, size)
}

export const drawGrenadeSprite = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 0.08
) => {
  if (drawItemSpritePng(context, "grenade", x, y, size)) {
    return
  }

  draw(context, grenadeSprite, x, y, size)
}

export const drawMolotovSprite = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 0.08
) => {
  if (drawItemSpritePng(context, "molotov", x, y, size)) {
    return
  }

  draw(context, molotovSprite, x, y, size)
}

export const drawFlameProjectileSprite = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 0.07
) => {
  draw(context, flameProjectileSprite, x, y, size)
}
