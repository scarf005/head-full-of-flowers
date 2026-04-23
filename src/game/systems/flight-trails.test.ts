/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { emitProjectileTrailEnd, updateFlightTrails } from "./flight-trails.ts"
import { createWorldState } from "../world/state.ts"

Deno.test("flight trail indices track active segments until they expire", () => {
  const world = createWorldState()

  emitProjectileTrailEnd(world, 0, 0, 8, 0, "ballistic")

  assertEquals(world.activeFlightTrailIndices.size > 0, true)

  updateFlightTrails(world, 1)

  assertEquals(world.activeFlightTrailIndices.size, 0)
})
