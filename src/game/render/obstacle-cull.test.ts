/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"

import { buildObstacleGridCullRange } from "./obstacle-cull.ts"

Deno.test("buildObstacleGridCullRange keeps bounds within grid limits", () => {
  const range = buildObstacleGridCullRange(112, 0, 0)

  assert(range.minX >= 0)
  assert(range.minY >= 0)
  assert(range.maxX <= 111)
  assert(range.maxY <= 111)
  assert(range.minX <= range.maxX)
  assert(range.minY <= range.maxY)
})

Deno.test("buildObstacleGridCullRange can return empty ranges when camera is far outside map", () => {
  const range = buildObstacleGridCullRange(112, 2000, 2000)

  assert(range.minX > range.maxX)
  assert(range.minY > range.maxY)
  assertEquals(range.maxX, 111)
  assertEquals(range.maxY, 111)
})

Deno.test("buildObstacleGridCullRange expands coverage as padding increases", () => {
  const base = buildObstacleGridCullRange(512, 0, 0, 0)
  const expanded = buildObstacleGridCullRange(512, 0, 0, 2)

  assert(expanded.minX <= base.minX)
  assert(expanded.maxX >= base.maxX)
  assert(expanded.minY <= base.minY)
  assert(expanded.maxY >= base.maxY)
})
