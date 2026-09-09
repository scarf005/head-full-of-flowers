import { randomFloat } from "../replay.ts"
import type { MapPropKind, TerrainMap } from "./terrain-types.ts"
import {
  circleFitsArena,
  gridRectToWorldRect,
  hasConnectedOpenTiles,
  randomInt,
  rectsOverlap,
} from "./terrain-utils.ts"
import { isWetTerrain } from "./terrain-wetlands.ts"
import type { GardenPlot } from "./terrain-courtyards.ts"

export const PROP_SPECS = {
  flowerbed: { sprite: 0, width: 2, height: 1, solid: false },
  bench: { sprite: 1, width: 2, height: 1, solid: true },
  reeds: { sprite: 2, width: 1, height: 1, solid: false },
  lilies: { sprite: 3, width: 1, height: 1, solid: false },
  mushrooms: { sprite: 4, width: 1, height: 1, solid: false },
  rocks: { sprite: 5, width: 1, height: 1, solid: true },
  urn: { sprite: 6, width: 1, height: 1, solid: true },
  wheelbarrow: { sprite: 7, width: 2, height: 1, solid: true },
  bed: { sprite: 8, width: 2, height: 2, solid: true },
  table: { sprite: 9, width: 2, height: 1, solid: true },
  chair: { sprite: 10, width: 1, height: 1, solid: true },
  bookshelf: { sprite: 11, width: 2, height: 1, solid: true },
  rug: { sprite: 12, width: 2, height: 2, solid: false },
  plant: { sprite: 13, width: 1, height: 1, solid: false },
  barrel: { sprite: 14, width: 1, height: 1, solid: true },
  birdbath: { sprite: 15, width: 1, height: 1, solid: true },
} as const satisfies Record<MapPropKind, { sprite: number; width: number; height: number; solid: boolean }>

type Placement = { kind: MapPropKind | "box"; left: number; top: number }
type Rect = { left: number; top: number; width: number; height: number }

export const populateGarden = (map: TerrainMap, plots: GardenPlot[] = []) => {
  const { size, tiles, obstacles, props } = map
  const half = Math.floor(size / 2)
  const occupied = tiles.map((row) => row.map(() => false))
  const bounds = (rect: { x: number; y: number; width: number; height: number }): Rect => ({
    left: Math.floor(rect.x - rect.width / 2 + half),
    top: Math.floor(rect.y - rect.height / 2 + half),
    width: rect.width,
    height: rect.height,
  })
  const cells = ({ left, top, width, height }: Rect) =>
    Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => ({ x: left + x, y: top + y })))
      .flat()
  for (const obstacle of obstacles) {
    const rect = bounds(obstacle)
    for (const { x, y } of cells(rect)) {
      if (obstacle.tiles.length === 0 || obstacle.tiles[y - rect.top]?.[x - rect.left]) occupied[y][x] = true
    }
  }
  for (const prop of props) for (const { x, y } of cells(bounds(prop))) occupied[y][x] = true
  const spec = (kind: Placement["kind"]) => kind === "box" ? { width: 1, height: 1, solid: true } : PROP_SPECS[kind]
  const rectOf = (placement: Placement): Rect => ({ ...placement, ...spec(placement.kind) })
  const worldRect = (rect: Rect) => gridRectToWorldRect(rect.left, rect.top, rect.width, rect.height, size)
  const free = (rect: Rect) => cells(rect).every(({ x, y }) => occupied[y]?.[x] === false)
  const putGroup = (group: Placement[]) => {
    for (const placement of group) {
      const rect = rectOf(placement)
      if (placement.kind === "box") obstacles.push({ kind: "box", ...worldRect(rect), tiles: [] })
      else props.push({ kind: placement.kind, ...worldRect(rect), solid: spec(placement.kind).solid })
      for (const { x, y } of cells(rect)) occupied[y][x] = true
    }
  }
  const groupFits = (group: Placement[]) =>
    group.every((placement, index) =>
      free(rectOf(placement)) &&
      group.slice(0, index).every((other) => !rectsOverlap(worldRect(rectOf(placement)), worldRect(rectOf(other)), 0))
    )

  const buildings = obstacles.filter((obstacle) =>
    obstacle.kind === "house" || obstacle.kind === "warehouse" || obstacle.kind === "hedge"
  )
  for (const house of buildings) {
    if (house.kind === "hedge") continue
    const houseRect = bounds(house)
    for (const { x, y } of cells(houseRect)) tiles[y][x] = house.kind === "warehouse" ? "concrete" : "wood-floor"
    if (house.kind !== "house") continue
    const rooms = [...house.rooms ?? []].sort((a, b) => b.width * b.height - a.width * a.height)
    const kitchen = rooms.at(-1)
    if (kitchen) {
      for (
        const { x, y } of cells({ ...kitchen, left: houseRect.left + kitchen.left, top: houseRect.top + kitchen.top })
      ) {
        tiles[y][x] = "tile-floor"
      }
    }
    const doors = house.tiles.flatMap((row, y) =>
      row.flatMap((solid, x) =>
        !solid && (x === 0 || y === 0 || x === house.width - 1 || y === house.height - 1 ||
            (house.tiles[y - 1]?.[x] && house.tiles[y + 1]?.[x]) || (row[x - 1] && row[x + 1]))
          ? [{ x: houseRect.left + x, y: houseRect.top + y }]
          : []
      )
    )
    let houseBlocked = occupied.slice(houseRect.top, houseRect.top + house.height).map((row) =>
      row.slice(houseRect.left, houseRect.left + house.width)
    )
    const furnish = (arrangement: Placement[], candidates = rooms) => {
      const width = Math.max(...arrangement.map((p) => p.left + spec(p.kind).width))
      const height = Math.max(...arrangement.map((p) => p.top + spec(p.kind).height))
      for (const room of candidates) {
        if (room.width < width || room.height < height) continue
        const slots = cells({ ...room, width: room.width - width + 1, height: room.height - height + 1 })
          .filter(({ x, y }) =>
            x === room.left || y === room.top ||
            x + width === room.left + room.width || y + height === room.top + room.height
          )
        const start = randomInt(0, slots.length - 1)
        for (let slot = 0; slot < slots.length; slot += 1) {
          const { x: left, y: top } = slots[(start + slot) % slots.length]
          const group = arrangement.map((p) => ({
            ...p,
            left: houseRect.left + left + p.left,
            top: houseRect.top + top + p.top,
          }))
          if (!groupFits(group)) continue
          if (
            group.some((p) =>
              cells(rectOf(p)).some(({ x, y }) =>
                doors.some((door) => Math.abs(door.x - x) + Math.abs(door.y - y) <= 1)
              )
            )
          ) continue
          const blocked = houseBlocked.map((row) => [...row])
          for (const p of group) {
            if (spec(p.kind).solid) {
              for (const { x, y } of cells(rectOf(p))) blocked[y - houseRect.top][x - houseRect.left] = true
            }
          }
          if (!hasConnectedOpenTiles(blocked)) continue
          putGroup(group)
          houseBlocked = blocked
          return true
        }
      }
      return false
    }
    const livingRooms = rooms.filter((room) => room !== kitchen)
    furnish([{ kind: "bed", left: 0, top: 0 }], [...livingRooms].reverse())
    furnish([{ kind: "table", left: 0, top: 0 }, { kind: "chair", left: 0, top: 1 }])
    furnish([{ kind: "bookshelf", left: 0, top: 0 }], livingRooms)
    furnish([{ kind: "rug", left: 0, top: 0 }], livingRooms)
    for (const room of rooms) furnish([{ kind: "plant", left: 0, top: 0 }], [room])
  }

  const reserved = [...plots, ...buildings.map((building) => worldRect(bounds(building)))]
  const isRoad = (x: number, y: number) => ["dirt-road", "gravel", "road-edge"].includes(tiles[y]?.[x])
  const dryArea = (rect: Rect, padding = 1) =>
    free(rect) &&
    !reserved.some((other) => rectsOverlap(worldRect(rect), other, padding)) &&
    cells(rect).every(({ x, y }) =>
      circleFitsArena(x, y, size, size * 0.15) && !isWetTerrain(tiles[y][x]) && !isRoad(x, y)
    )

  // Supplies belong to a building's service yard, with room to walk between it and the wall.
  for (const building of buildings.filter((building) => building.kind === "warehouse")) {
    const rect = bounds(building)
    const yards = [
      { left: rect.left, top: rect.top - 5, width: 4, height: 3 },
      { left: rect.left, top: rect.top + rect.height + 2, width: 4, height: 3 },
      { left: rect.left - 6, top: rect.top, width: 4, height: 3 },
      { left: rect.left + rect.width + 2, top: rect.top, width: 4, height: 3 },
    ]
    for (const yard of yards) {
      if (!dryArea(yard)) continue
      const group: Placement[] = [
        { kind: "wheelbarrow", left: yard.left, top: yard.top },
        { kind: "barrel", left: yard.left + 3, top: yard.top },
        ...Array.from({ length: 4 }, (_, x) => ({ kind: "box" as const, left: yard.left + x, top: yard.top + 2 })),
      ]
      if (!groupFits(group)) continue
      for (const { x, y } of cells(yard)) tiles[y][x] = "dirt"
      putGroup(group)
      reserved.push(worldRect(yard))
      break
    }
  }

  // Small woodland clusters follow ground cover; cultivated furniture never enters these patches.
  for (let y = 3; y < size - 6; y += 5) {
    for (let x = 3; x < size - 6; x += 5) {
      const rect = { left: x + randomInt(0, 1), top: y + randomInt(0, 1), width: 3, height: 3 }
      if (tiles[rect.top][rect.left] !== "wild-grass" || !dryArea(rect, 2)) continue
      const offsets = [{ x: 1, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 1 }]
      const offset = randomInt(0, offsets.length - 1)
      const group: Placement[] = [
        { kind: "rocks", left: rect.left + 1, top: rect.top + 1 },
        ...[offsets[offset], offsets[(offset + 1) % offsets.length]].map(({ x, y }) => ({
          kind: "mushrooms" as const,
          left: rect.left + x,
          top: rect.top + y,
        })),
      ]
      if (groupFits(group)) putGroup(group)
      reserved.push(worldRect(rect))
    }
  }
  for (let y = 3; y < size - 3; y += 2) {
    for (let x = 3; x < size - 3; x += 2) {
      const left = x + randomInt(0, 1)
      const top = y + randomInt(0, 1)
      const tile = tiles[top][left]
      if (!isWetTerrain(tile) && tile !== "sand") continue
      const neighbors = [[left - 1, top], [left + 1, top], [left, top - 1], [left, top + 1]].map(([nx, ny]) =>
        tiles[ny]?.[nx]
      )
      const kind = tile === "water" && neighbors.every((neighbor) => neighbor === "water")
        ? "lilies"
        : neighbors.some((neighbor) => !isWetTerrain(neighbor))
        ? "reeds"
        : undefined
      if (!kind || randomFloat() < 0.35) continue
      const group: Placement[] = [{ kind, left, top }]
      if (groupFits(group)) putGroup(group)
    }
  }
}
