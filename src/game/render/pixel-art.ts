import type { PrimaryWeaponId } from "../types.ts"

type SpriteRow = string

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

const flameProjectileSprite: SpriteRow[] = [
  "....C...",
  "...cCc..",
  "..cCCc..",
  ".cCyyCc.",
  "..cCCc..",
  "...cCc..",
  "....c...",
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
  draw(context, weaponSprites[weaponId], x, y, size)
}

export const drawGrenadeSprite = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 0.08
) => {
  draw(context, grenadeSprite, x, y, size)
}

export const drawFlameProjectileSprite = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 0.07
) => {
  draw(context, flameProjectileSprite, x, y, size)
}
