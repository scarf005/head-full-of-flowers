/// <reference lib="deno.ns" />
import { assert, assertEquals } from "jsr:@std/assert"
import { createBarrenGardenMap } from "./terrain-map.ts"
import { createCourtyards } from "./terrain-courtyards.ts"
import { createSeededRandom, withRandomSource } from "../replay.ts"
import { buildObstacleGridFromMap, damageObstacleCell, OBSTACLE_MATERIAL_PROP } from "./obstacle-grid.ts"
import { populateGarden, PROP_SPECS } from "./terrain-props.ts"
import type { TerrainMap } from "./terrain-types.ts"

Deno.test("garden props follow habitats and keep roads and furnished house rooms open", () => {
  const kinds = new Set<string>()
  for (let seed = 0; seed < 12; seed += 1) {
    const map = withRandomSource(createSeededRandom(`props-${seed}`), () => createBarrenGardenMap(112))
    assert(map.props.some((prop) => prop.kind === "flowerbed"))
    const grid = buildObstacleGridFromMap(map)
    const occupied = new Set<number>()
    for (const prop of map.props) {
      kinds.add(prop.kind)
      const left = prop.x - prop.width / 2 + 56
      const top = prop.y - prop.height / 2 + 56
      for (let y = top; y < top + prop.height; y += 1) {
        for (let x = left; x < left + prop.width; x += 1) {
          const tile = map.tiles[y][x]
          assert(!occupied.has(y * map.size + x), `${seed}: overlapping props at ${x},${y}`)
          occupied.add(y * map.size + x)
          assertEquals(grid.hp[y * map.size + x], 3)
          assert(tile !== "dirt-road" && tile !== "gravel" && tile !== "road-edge")
          if (prop.kind === "lilies") assertEquals(tile, "water")
          if (prop.kind === "bed") assertEquals(tile, "wood-floor")
          if (!prop.solid) assertEquals(grid.solid[y * map.size + x], 0)
          if (prop.solid) {
            assert(tile !== "water" && tile !== "marsh")
            assertEquals(grid.material[y * 112 + x], OBSTACLE_MATERIAL_PROP)
          }
        }
      }
    }
    for (const house of map.obstacles.filter((obstacle) => obstacle.kind === "house")) {
      const left = house.x - house.width / 2 + 56
      const top = house.y - house.height / 2 + 56
      const insideProps = map.props.filter((prop) =>
        Math.abs(prop.x - house.x) < house.width / 2 && Math.abs(prop.y - house.y) < house.height / 2
      )
      assert(insideProps.length >= 3, `${seed}: unfurnished house`)
      for (const prop of insideProps) {
        assert(
          house.rooms?.some((room) =>
            prop.x - prop.width / 2 + 56 >= left + room.left &&
            prop.y - prop.height / 2 + 56 >= top + room.top &&
            prop.x + prop.width / 2 + 56 <= left + room.left + room.width &&
            prop.y + prop.height / 2 + 56 <= top + room.top + room.height
          ),
          `${seed}: furniture straddles rooms`,
        )
      }
      const open: number[] = []
      for (let y = top; y < top + house.height; y += 1) {
        for (let x = left; x < left + house.width; x += 1) {
          assert(["wood-floor", "tile-floor"].includes(map.tiles[y][x]))
          if (!grid.solid[y * 112 + x]) open.push(y * 112 + x)
        }
      }
      const allowed = new Set(open)
      const visited = new Set([open[0]])
      const queue = [open[0]]
      for (let i = 0; i < queue.length; i += 1) {
        for (const neighbor of [queue[i] - 1, queue[i] + 1, queue[i] - 112, queue[i] + 112]) {
          if (!allowed.has(neighbor) || visited.has(neighbor)) continue
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
      assertEquals(visited.size, open.length, `${seed}: furniture or loot disconnects a room`)
    }
  }
  assertEquals(kinds.size, Object.keys(PROP_SPECS).length)
})

Deno.test("large furniture takes shared damage and disappears with its entire collision footprint", () => {
  const map: TerrainMap = {
    size: 8,
    tiles: Array.from({ length: 8 }, () => Array(8).fill("wood-floor")),
    obstacles: [],
    pickupSpawnPoints: [],
    props: [
      { kind: "bed", x: 0, y: 0, width: 2, height: 2, solid: true },
      { kind: "rug", x: 2, y: 2, width: 2, height: 2, solid: false },
    ],
  }
  const grid = buildObstacleGridFromMap(map)
  const cells = [27, 28, 35, 36]
  assert(cells.every((cell) => grid.solid[cell] === 1))
  assertEquals(grid.solid[5 * 8 + 5], 0)
  assertEquals(damageObstacleCell(grid, 3, 3, 1).destroyed, false)
  assert(cells.every((cell) => grid.hp[cell] === 2))
  assertEquals(damageObstacleCell(grid, 4, 4, 2).destroyed, true)
  assert(cells.every((cell) => grid.solid[cell] === 0))
  assertEquals(grid.propCells.size, 4, "the passable rug remains damageable")
  assertEquals(damageObstacleCell(grid, 5, 5, 3).destroyed, true)
  assertEquals(grid.propCells.size, 0)
})

Deno.test("cultivated objects form complete seating areas and supply yards instead of isolated scatter", () => {
  for (let seed = 0; seed < 12; seed += 1) {
    const map = withRandomSource(createSeededRandom(`compositions-${seed}`), () => createBarrenGardenMap(112))
    const nearby = (a: { x: number; y: number }, b: { x: number; y: number }, distance: number) =>
      Math.hypot(a.x - b.x, a.y - b.y) <= distance
    const benches = map.props.filter((prop) => prop.kind === "bench")
    assert(benches.length > 0)
    assertEquals(map.props.filter((prop) => prop.kind === "urn").length, benches.length)
    assertEquals(map.props.filter((prop) => prop.kind === "birdbath").length, benches.length)
    for (const bench of benches) {
      for (const kind of ["urn", "birdbath", "flowerbed"] as const) {
        assert(map.props.some((prop) => prop.kind === kind && nearby(prop, bench, kind === "flowerbed" ? 12 : 6)))
      }
    }
    for (const table of map.props.filter((prop) => prop.kind === "table")) {
      assert(map.props.some((prop) => prop.kind === "chair" && prop.x === table.x - 0.5 && prop.y === table.y + 1))
    }
    for (const barrel of map.props.filter((prop) => prop.kind === "barrel")) {
      assert(map.props.some((prop) => prop.kind === "wheelbarrow" && prop.x === barrel.x - 2.5 && prop.y === barrel.y))
      const crates = map.obstacles.filter((obstacle) =>
        obstacle.kind === "box" &&
        obstacle.y === barrel.y + 2 && obstacle.x >= barrel.x - 3 && obstacle.x <= barrel.x
      )
      assertEquals(crates.length, 4)
      assert(map.obstacles.some((obstacle) => obstacle.kind === "warehouse" && nearby(obstacle, barrel, 12)))
    }
  }
})

Deno.test("a cramped lot cannot leave fragments of a garden composition", () => {
  const size = 32
  const map: TerrainMap = {
    size,
    tiles: Array.from({ length: size }, () => Array(size).fill("grass")),
    obstacles: [{
      kind: "wall",
      x: 0,
      y: 0,
      width: size,
      height: size,
      tiles: Array.from(
        { length: size },
        (_, y) => Array.from({ length: size }, (_, x) => x < 14 || x > 17 || y < 14 || y > 17),
      ),
    }],
    pickupSpawnPoints: [],
    props: [],
  }
  const before = structuredClone(map)
  withRandomSource(createSeededRandom("cramped-garden"), () => populateGarden(map))
  assertEquals(map, before)
})

Deno.test("courtyards reject a shoreline too narrow for the complete layout without painting paths", () => {
  const tiles = Array.from(
    { length: 64 },
    (_, y) =>
      Array.from(
        { length: 64 },
        (_, x) => x < 29 || x > 34 ? "water" as const : y < 30 ? "grass" as const : "gravel" as const,
      ),
  )
  const before = structuredClone(tiles)
  const result = withRandomSource(createSeededRandom("narrow-shore"), () => createCourtyards(tiles))
  assertEquals(result, { obstacles: [], props: [], plots: [] })
  assertEquals(tiles, before)
})
