export interface FactionDescriptor {
  id: string
  label: string
  color: string
}

const BOT_PALETTES = [
  { tone: "#7aa6ff", edge: "#3d67bf" },
  { tone: "#ff9c8e", edge: "#c95a5f" },
  { tone: "#89d7b7", edge: "#2f9b7c" },
  { tone: "#f7c276", edge: "#b88335" },
  { tone: "#c7a8ff", edge: "#7d59b7" },
  { tone: "#f3a7d8", edge: "#b36093" },
  { tone: "#9fd4ff", edge: "#4f7fa8" }
]

export const playerFaction = (): FactionDescriptor => ({
  id: "player",
  label: "You",
  color: "#f2ffe8"
})

export const botFaction = (index: number): FactionDescriptor => ({
  id: `bot-${index + 1}`,
  label: `Bot ${index + 1}`,
  color: BOT_PALETTES[index % BOT_PALETTES.length].tone
})

export const buildFactions = (botCount: number): FactionDescriptor[] => {
  return [
    playerFaction(),
    ...Array.from({ length: botCount }, (_, index) => botFaction(index))
  ]
}

export const createFactionFlowerCounts = (factions: FactionDescriptor[]): Record<string, number> => {
  return Object.fromEntries(factions.map((faction) => [faction.id, 0]))
}

export const botPalette = (id: string) => {
  const index = Number(id.replace("bot-", "")) - 1
  return BOT_PALETTES[Math.max(0, index) % BOT_PALETTES.length]
}
