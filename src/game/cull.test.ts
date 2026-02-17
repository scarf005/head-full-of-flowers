/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { buildCullBounds, isInsideCullBounds } from "./cull.ts"

Deno.test("buildCullBounds expands with padding", () => {
  const withoutPadding = buildCullBounds(0, 0, 0)
  const withPadding = buildCullBounds(0, 0, 2)

  assertEquals(withPadding.minX < withoutPadding.minX, true)
  assertEquals(withPadding.maxX > withoutPadding.maxX, true)
  assertEquals(withPadding.minY < withoutPadding.minY, true)
  assertEquals(withPadding.maxY > withoutPadding.maxY, true)
})

Deno.test("isInsideCullBounds applies additional object padding", () => {
  const bounds = buildCullBounds(0, 0, 0)
  const xOutside = bounds.maxX + 0.2

  assertEquals(isInsideCullBounds(xOutside, 0, bounds, 0), false)
  assertEquals(isInsideCullBounds(xOutside, 0, bounds, 0.25), true)
})
