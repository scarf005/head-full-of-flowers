import type { MapObstacleBlueprint, MapProp, MapPropKind, TerrainTile } from "./terrain-types.ts"
import { circleFitsArena, gridRectToWorldRect, randomInt, rectsOverlap } from "./terrain-utils.ts"
import { PROP_SPECS } from "./terrain-props.ts"
import { isWetTerrain } from "./terrain-wetlands.ts"

export interface GardenPlot {
  x: number
  y: number
  width: number
  height: number
}

type Rect = { left: number; top: number; width: number; height: number }
type Placement = { kind: MapPropKind; left: number; top: number }

export const createCourtyards = (tiles: TerrainTile[][]) => {
  const size = tiles.length
  const obstacles: MapObstacleBlueprint[] = []
  const props: MapProp[] = []
  const reserved: GardenPlot[] = []
  const cells = ({ left, top, width, height }: Rect) =>
    Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => ({ x: left + x, y: top + y })))
      .flat()
  const worldRect = (rect: Rect) => gridRectToWorldRect(rect.left, rect.top, rect.width, rect.height, size)
  const isRoad = (x: number, y: number) => ["dirt-road", "gravel", "road-edge"].includes(tiles[y]?.[x])
  const dryArea = (rect: Rect, padding: number) =>
    !reserved.some((other) => rectsOverlap(worldRect(rect), other, padding)) &&
    cells(rect).every(({ x, y }) =>
      circleFitsArena(x, y, size, size * 0.15) && !isWetTerrain(tiles[y][x]) && !isRoad(x, y)
    )
  const putGroup = (group: Placement[]) => {
    for (const placement of group) {
      const spec = PROP_SPECS[placement.kind]
      const rect = { ...placement, ...spec }
      props.push({ kind: placement.kind, ...worldRect(rect), solid: spec.solid })
    }
  }
  // Reserve the entire courtyard and its connection before placing any of its contents.
  const gardenCount = Math.max(2, Math.floor(size / 16))
  let gardens = 0
  for (let attempt = 0; attempt < size * size && gardens < gardenCount; attempt += 1) {
    const width = randomInt(5, 7) * 2 + 1
    const height = randomInt(4, 6) * 2 + 1
    const rect = { left: randomInt(3, size - width - 4), top: randomInt(3, size - height - 4), width, height }
    if (!dryArea(rect, 2)) continue
    const cx = rect.left + Math.floor(width / 2)
    const cy = rect.top + Math.floor(height / 2)
    const directions = [[0, -1, cx, rect.top], [0, 1, cx, rect.top + height - 1], [-1, 0, rect.left, cy], [
      1,
      0,
      rect.left + width - 1,
      cy,
    ]]
    let access: { x: number; y: number }[] | undefined
    for (const [dx, dy, startX, startY] of directions) {
      const corridor: { x: number; y: number }[] = []
      for (let distance = 1; distance <= 6; distance += 1) {
        const x = startX + dx * distance
        const y = startY + dy * distance
        const strip = {
          left: x - Math.abs(dy),
          top: y - Math.abs(dx),
          width: 1 + Math.abs(dy) * 2,
          height: 1 + Math.abs(dx) * 2,
        }
        if (
          reserved.some((other) => rectsOverlap(worldRect(strip), other, 0)) ||
          cells(strip).some((cell) =>
            !circleFitsArena(cell.x, cell.y, size, size * 0.15) || isWetTerrain(tiles[cell.y][cell.x])
          )
        ) break
        corridor.push(...cells(strip))
        if (["dirt-road", "gravel"].includes(tiles[y][x])) {
          access = corridor
          break
        }
      }
      if (access) break
    }
    if (!access) continue
    const group: Placement[] = []
    const quarters = [
      { left: rect.left + 1, top: rect.top + 1, width: cx - rect.left - 2, height: cy - rect.top - 2 },
      { left: cx + 2, top: rect.top + 1, width: rect.left + width - cx - 3, height: cy - rect.top - 2 },
      { left: rect.left + 1, top: cy + 2, width: cx - rect.left - 2, height: rect.top + height - cy - 3 },
      { left: cx + 2, top: cy + 2, width: rect.left + width - cx - 3, height: rect.top + height - cy - 3 },
    ]
    for (const [index, quarter] of quarters.entries()) {
      if (index === gardens % quarters.length) {
        group.push(
          { kind: "bench", left: quarter.left, top: quarter.top + quarter.height - 1 },
          { kind: "urn", left: quarter.left, top: quarter.top },
          { kind: "birdbath", left: quarter.left + quarter.width - 1, top: quarter.top },
        )
      } else {
        for (let y = quarter.top; y < quarter.top + quarter.height; y += 2) {
          for (let x = quarter.left; x + 1 < quarter.left + quarter.width; x += 3) {
            group.push({ kind: "flowerbed", left: x, top: y })
          }
        }
      }
    }
    for (const { x, y } of cells(rect)) {
      tiles[y][x] = Math.abs(x - cx) <= 1 || Math.abs(y - cy) <= 1 ? "gravel" : "clover"
    }
    for (const { x, y } of access) tiles[y][x] = "gravel"
    for (const side of [rect.top, rect.top + height - 1]) {
      for (const [left, span] of [[rect.left, cx - rect.left - 1], [cx + 2, rect.left + width - cx - 2]]) {
        obstacles.push({ kind: "wall", ...gridRectToWorldRect(left, side, span, 1, size), tiles: [] })
      }
    }
    for (const side of [rect.left, rect.left + width - 1]) {
      for (const [top, span] of [[rect.top + 1, cy - rect.top - 2], [cy + 2, rect.top + height - cy - 3]]) {
        if (span < 1) continue
        obstacles.push({ kind: "wall", ...gridRectToWorldRect(side, top, 1, span, size), tiles: [] })
      }
    }
    putGroup(group)
    reserved.push(worldRect(rect))
    gardens += 1
  }

  return { obstacles, props, plots: reserved }
}
