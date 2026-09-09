import type { TerrainMap } from "../world/terrain-types.ts"
import { wetTerrainAt } from "../world/terrain-wetlands.ts"

interface RippleUnit {
  id: string
  hp: number
  position: { x: number; y: number }
}

export interface WaterRipple {
  x: number
  y: number
  age: number
}
export interface WaterRippleState {
  ripples: WaterRipple[]
  positions: Map<string, { x: number; y: number; wet: boolean }>
}

export const createWaterRippleState = (): WaterRippleState => ({ ripples: [], positions: new Map() })

export const updateWaterRipples = ({ state, map, units, dt }: {
  state: WaterRippleState
  map: TerrainMap
  units: RippleUnit[]
  dt: number
}) => {
  if (dt <= 0) return
  for (const ripple of state.ripples) ripple.age += dt
  state.ripples = state.ripples.filter((ripple) => ripple.age < 0.8)
  const activeIds = new Set<string>()
  for (const unit of units) {
    if (unit.hp <= 0) continue
    activeIds.add(unit.id)
    const { x, y } = unit.position
    const previous = state.positions.get(unit.id)
    const wet = wetTerrainAt(map, x, y)
    const distance = previous ? Math.hypot(x - previous.x, y - previous.y) : 0
    if (wet && previous && distance < 3 && (distance >= 0.35 || !previous.wet)) {
      state.ripples.push({ x, y, age: 0 })
    }
    if (!previous || !wet || distance >= 0.35 || wet !== previous.wet) {
      state.positions.set(unit.id, { x, y, wet })
    }
  }
  for (const id of state.positions.keys()) if (!activeIds.has(id)) state.positions.delete(id)
  if (state.ripples.length > 96) state.ripples.splice(0, state.ripples.length - 96)
}
