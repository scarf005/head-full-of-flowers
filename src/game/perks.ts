import type { Unit } from "./entities.ts"
import type { PerkId } from "./types.ts"

export interface PerkConfig {
  id: PerkId
  label: string
  maxStacks: number
}

const AIM_ASSIST_RADIANS = 0.22
const VITAL_BLOOM_HP = 3
const LASER_SIGHT_RANGE_MULTIPLIER = 1.2
const PROXIMITY_PERK_RADIUS_BONUS = 0.45
const HEAVY_PELLETS_DAMAGE_BONUS = 1

export const PERK_CONFIGS: Record<PerkId, PerkConfig> = {
  laser_sight: {
    id: "laser_sight",
    label: "Laser Sight",
    maxStacks: 1,
  },
  ricochet_shells: {
    id: "ricochet_shells",
    label: "Ricochet Shells",
    maxStacks: 1,
  },
  proximity_grenades: {
    id: "proximity_grenades",
    label: "Proximity Grenades",
    maxStacks: 1,
  },
  rapid_reload: {
    id: "rapid_reload",
    label: "Rapid Reload",
    maxStacks: 1,
  },
  kill_reload: {
    id: "kill_reload",
    label: "Adrenal Reload",
    maxStacks: 1,
  },
  heavy_pellets: {
    id: "heavy_pellets",
    label: "Heavy Pellets",
    maxStacks: 1,
  },
  extra_heart: {
    id: "extra_heart",
    label: "Extra Heart",
    maxStacks: 4,
  },
  extra_stamina: {
    id: "extra_stamina",
    label: "Extra Stamina",
    maxStacks: 1,
  },
  kevlar_vest: {
    id: "kevlar_vest",
    label: "Kevlar Vest",
    maxStacks: 1,
  },
}

export const PERK_POOL: PerkId[] = [
  "laser_sight",
  "ricochet_shells",
  "proximity_grenades",
  "rapid_reload",
  "kill_reload",
  "heavy_pellets",
  "extra_heart",
  "extra_stamina",
  "kevlar_vest",
]

export const randomPerkId = () => {
  const index = Math.floor(Math.random() * PERK_POOL.length)
  return PERK_POOL[index] ?? "extra_heart"
}

export const perkStacks = (unit: Unit, perkId: PerkId) => {
  return unit.perkStacks[perkId] ?? 0
}

export const applyPerkToUnit = (unit: Unit, perkId: PerkId) => {
  const config = PERK_CONFIGS[perkId]
  const currentStacks = perkStacks(unit, perkId)
  if (currentStacks >= config.maxStacks) {
    return {
      applied: false,
      stacks: currentStacks,
    }
  }

  if (perkId === "ricochet_shells") {
    unit.shotgunRicochet = true
  } else if (perkId === "laser_sight") {
    unit.laserSight = true
    unit.aimAssistRadians = Math.max(unit.aimAssistRadians, AIM_ASSIST_RADIANS)
    unit.projectileRangeMultiplier = Math.max(unit.projectileRangeMultiplier, LASER_SIGHT_RANGE_MULTIPLIER)
  } else if (perkId === "proximity_grenades") {
    unit.proximityGrenades = true
    unit.projectileProximityBonus += PROXIMITY_PERK_RADIUS_BONUS
  } else if (perkId === "rapid_reload") {
    unit.reloadSpeedMultiplier *= 1.25
  } else if (perkId === "heavy_pellets") {
    unit.bulletSizeMultiplier *= 1.5
    unit.fireRateMultiplier *= 0.75
    unit.projectileDamageBonus += HEAVY_PELLETS_DAMAGE_BONUS
  } else if (perkId === "extra_heart") {
    unit.maxHp += VITAL_BLOOM_HP
    unit.hp = Math.min(unit.maxHp, unit.hp + VITAL_BLOOM_HP)
  } else if (perkId === "extra_stamina") {
    unit.speed *= 1.12
  } else if (perkId === "kevlar_vest") {
    unit.damageReductionFlat += 1
  }

  const nextStacks = currentStacks + 1
  unit.perkStacks[perkId] = nextStacks
  return {
    applied: true,
    stacks: nextStacks,
  }
}
