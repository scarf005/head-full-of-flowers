import { sample } from "@std/random"

import type { Unit } from "./entities.ts"
import type { PerkOption } from "./signals.ts"

export interface PerkDefinition extends PerkOption {
  apply: (player: Unit) => string
}

const clampHp = (player: Unit) => {
  player.hp = Math.min(player.hp, player.maxHp)
}

export const PERK_DEFINITIONS: PerkDefinition[] = [
  {
    id: "photosynthesis",
    name: "Photosynthesis",
    description: "+30% damage",
    apply: (player) => {
      player.damageMultiplier *= 1.3
      return "Damage climbs with Photosynthesis"
    }
  },
  {
    id: "pollen-spread",
    name: "Pollen Spread",
    description: "+25% bullet size, -10% fire rate",
    apply: (player) => {
      player.bulletSizeMultiplier *= 1.25
      player.fireRateMultiplier *= 0.9
      return "Pollen Spread blooms into larger shots"
    }
  },
  {
    id: "deep-roots",
    name: "Deep Roots",
    description: "Max HP +3",
    apply: (player) => {
      player.maxHp += 3
      player.hp += 3
      clampHp(player)
      return "Deep Roots harden your frame"
    }
  },
  {
    id: "swift-thorns",
    name: "Swift Thorns",
    description: "+18% move speed",
    apply: (player) => {
      player.speed *= 1.18
      return "Swift Thorns sharpen your stride"
    }
  },
  {
    id: "sap-battery",
    name: "Sap Battery",
    description: "Secondary cooldown -20%",
    apply: (player) => {
      player.grenadeTimer *= 0.8
      return "Sap Battery refreshes your throwables"
    }
  }
]

export const randomPerkChoices = (count = 3) => {
  const bucket = [...PERK_DEFINITIONS]
  const choices: PerkDefinition[] = []

  while (choices.length < count && bucket.length > 0) {
    const choice = sample(bucket)
    const index = choice ? bucket.indexOf(choice) : -1
    if (index < 0) {
      break
    }
    const [next] = bucket.splice(index, 1)
    choices.push(next)
  }

  return choices
}
