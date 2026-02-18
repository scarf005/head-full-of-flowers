import { clamp } from "../utils.ts"

export const computeDamageTakenRatio = (hp: number, maxHp: number) => {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
    return 0
  }

  return clamp((maxHp - hp) / maxHp, 0, 1)
}
