/// <reference lib="deno.ns" />
import { createSeededRandom, withRandomSource } from "../src/game/replay.ts"
import { createBarrenGardenMap } from "../src/game/world/terrain-map.ts"
import type { MapPropKind, TerrainTile } from "../src/game/world/terrain-types.ts"

const seed = Deno.args[0] ?? "garden-review"
const size = Number(Deno.args[1] ?? 112)
if (!Number.isInteger(size) || size % 2 !== 0 || size < 32 || size > 256) {
  throw new Error("Map size must be an even integer between 32 and 256")
}
const map = withRandomSource(createSeededRandom(seed), () => createBarrenGardenMap(size))
const terrain: Record<TerrainTile, string> = {
  grass: ".",
  clover: ",",
  "wild-grass": '"',
  dirt: ":",
  "dirt-road": "=",
  "road-edge": ":",
  gravel: "=",
  concrete: "_",
  water: "~",
  marsh: ";",
  sand: "-",
  "wood-floor": "_",
  "tile-floor": "+",
}
const props: Record<MapPropKind, string> = {
  flowerbed: "F",
  bench: "B",
  reeds: "r",
  lilies: "l",
  mushrooms: "m",
  rocks: "O",
  urn: "u",
  wheelbarrow: "w",
  bed: "b",
  table: "t",
  chair: "c",
  bookshelf: "s",
  rug: "-",
  plant: "p",
  barrel: "o",
  birdbath: "a",
}
const rows = map.tiles.map((row) => row.map((tile) => terrain[tile]))
for (const object of [...map.obstacles, ...map.props]) {
  const left = Math.floor(object.x - object.width / 2 + Math.floor(size / 2))
  const top = Math.floor(object.y - object.height / 2 + Math.floor(size / 2))
  for (let y = 0; y < object.height; y += 1) {
    for (let x = 0; x < object.width; x += 1) {
      if ("tiles" in object && object.tiles.length > 0 && !object.tiles[y][x]) continue
      rows[top + y][left + x] = "tiles" in object
        ? object.kind === "hedge" ? "H" : object.kind === "box" || object.kind === "high-tier-box" ? "$" : "#"
        : props[object.kind]
    }
  }
}
console.log(`Seed: ${seed} | Size: ${size} | Props: ${map.props.length}`)
console.log(
  'Terrain: . grass  , clover  " wild grass  : dirt/road edge  = road  ~ lake  ; marsh  _ floor  + tiled floor',
)
console.log(
  "Objects: # wall/building  H hedge  $ crate  F flowerbed  B bench  u urn  a birdbath  w wheelbarrow  o barrel",
)
console.log("         O rocks  m mushrooms  r reeds  l lilies  b bed  t table  c chair  s bookshelf  - rug  p plant")
console.log("    " + Array.from({ length: size }, (_, x) => Math.floor(x / 10) % 10).join(""))
console.log("    " + Array.from({ length: size }, (_, x) => x % 10).join(""))
for (const [y, row] of rows.entries()) console.log(String(y).padStart(3) + " " + row.join(""))
