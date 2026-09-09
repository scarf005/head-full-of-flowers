/// <reference lib="deno.ns" />
import { assertEquals } from "jsr:@std/assert"
import { createWaterRippleState, updateWaterRipples } from "./water-ripples.ts"
import type { TerrainMap } from "../world/terrain-types.ts"

Deno.test("water wakes follow movement, stop spawning at rest, fade and ignore teleportation", () => {
  const map: TerrainMap = {
    size: 16,
    tiles: Array.from({ length: 16 }, () => Array(16).fill("water")),
    obstacles: [],
    pickupSpawnPoints: [],
    props: [],
  }
  const state = createWaterRippleState()
  const unit = { id: "player", hp: 10, position: { x: 0, y: 0 } }
  const step = (dt = 0.1) => updateWaterRipples({ state, map, units: [unit], dt })
  step()
  assertEquals(state.ripples.length, 0)
  unit.position.x = 0.5
  step()
  assertEquals(state.ripples.length, 1)
  assertEquals(state.ripples[0].x, 0.5)
  step()
  assertEquals(state.ripples.length, 1)
  step(1)
  assertEquals(state.ripples.length, 0)
  unit.position.x = 5
  step()
  assertEquals(state.ripples.length, 0)
  unit.position.x = 5.5
  step(0)
  assertEquals(state.ripples.length, 0)
  step()
  assertEquals(state.ripples.length, 1)
  unit.hp = 0
  step(1)
  assertEquals(state.positions.size, 0)
})

Deno.test("dry ground creates no wakes and entering marsh does", () => {
  const map: TerrainMap = {
    size: 4,
    tiles: Array.from({ length: 4 }, () => ["grass", "grass", "marsh", "marsh"]),
    obstacles: [],
    pickupSpawnPoints: [],
    props: [],
  }
  const state = createWaterRippleState()
  const unit = { id: "bot", hp: 10, position: { x: -1.5, y: 0 } }
  const step = () => updateWaterRipples({ state, map, units: [unit], dt: 0.1 })
  step()
  unit.position.x = -0.1
  step()
  assertEquals(state.ripples.length, 0)
  unit.position.x = 0.05
  step()
  assertEquals(state.ripples.length, 1)
})
