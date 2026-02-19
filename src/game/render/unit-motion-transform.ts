import { clamp } from "../utils.ts"

const UNIT_HORIZONTAL_SKEW_MAX = 0.28
const WEAPON_KICKBACK_DISTANCE_MAX = 0.38
const WEAPON_KICKBACK_REFERENCE = 60

export const computeHorizontalSkewX = (velocityX: number, maxMoveSpeed: number) => {
  const normalizedSpeed = Number.isFinite(maxMoveSpeed) && maxMoveSpeed > 0.0001 ? maxMoveSpeed : 1
  return clamp(velocityX / normalizedSpeed, -1, 1) * UNIT_HORIZONTAL_SKEW_MAX * -1
}

export const computeWeaponKickbackDistance = (recoil: number, weaponKnockback: number, unitRadius: number) => {
  const normalizedRecoil = clamp(recoil, 0, 1)
  if (normalizedRecoil <= 0) {
    return 0
  }

  const safeRadius = Number.isFinite(unitRadius) && unitRadius > 0 ? unitRadius : 0
  const normalizedKnockback = clamp(weaponKnockback / WEAPON_KICKBACK_REFERENCE, 0, 1)
  return safeRadius * WEAPON_KICKBACK_DISTANCE_MAX * normalizedRecoil * normalizedKnockback
}
