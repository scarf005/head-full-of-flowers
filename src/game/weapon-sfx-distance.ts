export const WEAPON_SFX_MAX_DISTANCE_METERS = 40

export const weaponSfxVolumeMultiplierForDistance = (distanceMeters: number) => {
  if (!Number.isFinite(distanceMeters)) {
    return 1
  }

  return Math.max(0, Math.min(1, 1 - Math.max(0, distanceMeters) / WEAPON_SFX_MAX_DISTANCE_METERS))
}
