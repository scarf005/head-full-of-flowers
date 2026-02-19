/// <reference lib="deno.ns" />

import { assertAlmostEquals } from "jsr:@std/assert"

import { arenaRadiiForPlayerCount } from "./utils.ts"

Deno.test("arenaRadiiForPlayerCount returns minimum radii at 2 players", () => {
  const radii = arenaRadiiForPlayerCount(2)
  assertAlmostEquals(radii.start, 30, 0.0001)
  assertAlmostEquals(radii.end, 15, 0.0001)
})

Deno.test("arenaRadiiForPlayerCount returns baseline radii at 8 players", () => {
  const radii = arenaRadiiForPlayerCount(8)
  assertAlmostEquals(radii.start, 50, 0.0001)
  assertAlmostEquals(radii.end, 20, 0.0001)
})

Deno.test("arenaRadiiForPlayerCount scales proportionally between 2 and 8 players", () => {
  const radii = arenaRadiiForPlayerCount(5)
  assertAlmostEquals(radii.start, 40, 0.0001)
  assertAlmostEquals(radii.end, 17.5, 0.0001)
})

Deno.test("arenaRadiiForPlayerCount clamps above baseline player count", () => {
  const radii = arenaRadiiForPlayerCount(12)
  assertAlmostEquals(radii.start, 50, 0.0001)
  assertAlmostEquals(radii.end, 20, 0.0001)
})
