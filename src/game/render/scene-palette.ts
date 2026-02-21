import { botPalette } from "../factions.ts"
import { clamp } from "../utils.ts"
import type { WorldState } from "../world/state.ts"

const parseHexColor = (hex: string) => {
  const cleaned = hex.replace("#", "")
  if (cleaned.length !== 6) {
    return [255, 255, 255] as const
  }
  const red = Number.parseInt(cleaned.slice(0, 2), 16)
  const green = Number.parseInt(cleaned.slice(2, 4), 16)
  const blue = Number.parseInt(cleaned.slice(4, 6), 16)
  return [red, green, blue] as const
}

const toHex = (value: number) => {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")
}

const tintHex = (hex: string, multiplier: number, lift = 0) => {
  const [red, green, blue] = parseHexColor(hex)
  return `#${toHex(red * multiplier + lift)}${toHex(green * multiplier + lift)}${toHex(blue * multiplier + lift)}`
}

export const paletteForUnit = (world: WorldState, unit: WorldState["units"][number]) => {
  const isFfa = world.player.team === world.player.id
  if (isFfa) {
    return unit.isPlayer ? { tone: "#f6f2df", edge: "#b8b49a" } : botPalette(unit.id)
  }

  const teamColor = world.factions.find((faction) => faction.id === unit.team)?.color ?? "#d8e8cb"
  return {
    tone: tintHex(teamColor, 0.82, 22),
    edge: tintHex(teamColor, 0.55, 4),
  }
}

export const paletteForRagdoll = (world: WorldState, ragdoll: WorldState["ragdolls"][number]) => {
  const isFfa = world.player.team === world.player.id
  if (isFfa) {
    return ragdoll.isPlayer ? { tone: "#f6f2df", edge: "#b8b49a" } : botPalette(ragdoll.unitId || ragdoll.team)
  }

  const teamColor = world.factions.find((faction) => faction.id === ragdoll.team)?.color ?? "#d8e8cb"
  return {
    tone: tintHex(teamColor, 0.82, 22),
    edge: tintHex(teamColor, 0.55, 4),
  }
}
