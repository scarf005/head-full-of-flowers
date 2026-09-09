/// <reference lib="deno.ns" />
import { assertEquals } from "jsr:@std/assert"
import { spriteRegionUvs } from "./webgl-sprite-region.ts"

Deno.test("sprite sheet cells follow the uploaded image size, including fractional old cells", () => {
  for (const size of [96, 1254]) {
    for (let cell = 0; cell < 16; cell += 1) {
      const entry = { x: 3, y: 1, imageWidth: size, imageHeight: size }
      const common = { entry, atlasWidth: 2048, atlasHeight: 2048 }
      const x = cell % 4 / 4
      const y = Math.floor(cell / 4) / 4
      assertEquals(
        spriteRegionUvs({ ...common, sx: x, sy: y, sw: 0.25, sh: 0.25, normalized: true }),
        spriteRegionUvs({ ...common, sx: x * size, sy: y * size, sw: size / 4, sh: size / 4 }),
      )
    }
  }
})

Deno.test("out of bounds sprite crops cannot read neighboring packed textures", () => {
  const common = { entry: { x: 3, y: 1, imageWidth: 96, imageHeight: 96 }, atlasWidth: 512, atlasHeight: 512 }
  for (
    const rect of [
      { sx: 0, sy: 0, sw: 313.5, sh: 313.5 },
      { sx: -1, sy: 0, sw: 24, sh: 24 },
      { sx: 72, sy: 73, sw: 24, sh: 24 },
      { sx: 0, sy: 0, sw: 0, sh: 24 },
      { sx: NaN, sy: 0, sw: 24, sh: 24 },
    ]
  ) assertEquals(spriteRegionUvs({ ...common, ...rect }), null)
  assertEquals(spriteRegionUvs({ ...common, sx: 72, sy: 72, sw: 24, sh: 24 }), {
    u0: 75 / 512,
    u1: 99 / 512,
    v0: 73 / 512,
    v1: 97 / 512,
  })
})
