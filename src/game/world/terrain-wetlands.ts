import { randomFloat } from "../replay.ts"
import type { TerrainMap, TerrainTile } from "./terrain-types.ts"
import { randomInt, rectFitsArena, rectTouchesMask } from "./terrain-utils.ts"

export const isWetTerrain = (tile: TerrainTile) => tile === "water" || tile === "marsh"

export const terrainSpeedMultiplier = (tile: TerrainTile) => tile === "marsh" ? 0.45 : tile === "water" ? 0.65 : 1

export const addWetlands = ({ tiles, roads }: {
  tiles: TerrainTile[][]
  roads: boolean[][]
}) => {
  const size = tiles.length
  let placed = 0
  for (let attempt = 0; attempt < 500 && placed < 5; attempt += 1) {
    const rx = randomInt(4, 7)
    const ry = randomInt(3, 6)
    const x = randomInt(rx + 3, size - rx - 4)
    const y = randomInt(ry + 3, size - ry - 4)
    const left = x - rx - 1
    const top = y - ry - 1
    const width = rx * 2 + 3
    const height = ry * 2 + 3
    if (!rectFitsArena(left, top, width, height, size, size * 0.23)) continue
    if (rectTouchesMask(roads, left, top, width, height, 0)) continue
    if (tiles.slice(top, top + height).some((row) => row.slice(left, left + width).some(isWetTerrain))) continue
    const phase = randomFloat() * Math.PI * 2
    for (let gy = top; gy < top + height; gy += 1) {
      for (let gx = left; gx < left + width; gx += 1) {
        const dx = (gx - x) / rx
        const dy = (gy - y) / ry
        const angle = Math.atan2(dy, dx)
        const edge = 1 + Math.sin(angle * 3 + phase) * 0.09
        const distance = Math.hypot(dx, dy) / edge
        if (distance < 0.8) tiles[gy][gx] = placed % 2 === 0 ? "water" : "marsh"
        else if (distance < 1) tiles[gy][gx] = placed % 2 === 0 ? "sand" : "marsh"
      }
    }
    placed += 1
  }
}

export const wetTerrainAt = (map: TerrainMap, x: number, y: number) => {
  const half = Math.floor(map.size / 2)
  const tile = map.tiles[Math.floor(y) + half]?.[Math.floor(x) + half]
  return tile !== undefined && isWetTerrain(tile)
}
