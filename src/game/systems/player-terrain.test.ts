/// <reference lib="deno.ns" />
import { assertAlmostEquals, assertEquals } from "jsr:@std/assert"
import { Unit } from "../entities.ts"
import type { WorldState } from "../world/state.ts"
import type { TerrainTile } from "../world/terrain-types.ts"
import { updatePlayer } from "./player.ts"

Deno.test("player movement slows in lakes and marshes and recovers on land without changing base speed", () => {
  const player = new Unit("player", true, "player")
  player.speed = 10
  player.radius = 0.3
  const world = {
    player,
    arenaRadius: 40,
    input: { keys: new Set(["d"]), moveAxisX: 0, moveAxisY: 0, worldX: 10, worldY: 0, primarySwapDirection: 0 },
    terrainMap: { size: 16, tiles: Array.from({ length: 16 }, () => Array<TerrainTile>(16).fill("grass")) },
  } as WorldState
  const noop = () => {}
  const deps = {
    firePrimary: noop,
    continueBurst: noop,
    startReload: noop,
    throwSecondary: noop,
    swapPrimary: noop,
    collectNearbyPickup: noop,
    updateCrosshairWorld: noop,
  }
  for (const [tile, speed] of [["grass", 10], ["water", 6.5], ["marsh", 4.5], ["grass", 10]] as const) {
    player.position.set(0, 0)
    for (const row of world.terrainMap.tiles) row.fill(tile)
    updatePlayer(world, 0.1, deps)
    assertAlmostEquals(player.position.x, speed * 0.1)
    assertEquals(player.speed, 10)
  }
  world.input.keys = new Set(["w", "d"])
  player.position.set(0, 0)
  updatePlayer(world, 0.1, deps)
  assertAlmostEquals(player.velocity.length(), 10)
})
