import { t } from "@lingui/core/macro"

import type { PerkId, PrimaryWeaponId } from "../types.ts"

export const localizePrimaryWeapon = (weaponId: PrimaryWeaponId) => {
  if (weaponId === "pistol") {
    return t`Pistol`
  }
  if (weaponId === "assault") {
    return t`Assault Rifle`
  }
  if (weaponId === "shotgun") {
    return t`Shotgun`
  }
  if (weaponId === "auto-shotgun") {
    return t`Auto Shotgun`
  }
  if (weaponId === "battle-rifle") {
    return t`Battle Rifle`
  }
  if (weaponId === "grenade-launcher") {
    return t`Grenade Launcher`
  }
  if (weaponId === "rocket-launcher") {
    return t`Rocket Launcher`
  }

  return t`Flamethrower`
}

export const localizePerk = (perkId: PerkId) => {
  if (perkId === "laser_sight") {
    return t`Laser Sight`
  }
  if (perkId === "ricochet_shells") {
    return t`Ricochet Shells`
  }
  if (perkId === "proximity_grenades") {
    return t`Proximity Grenades`
  }
  if (perkId === "rapid_reload") {
    return t`Rapid Reload`
  }
  if (perkId === "heavy_pellets") {
    return t`Heavy Pellets`
  }
  if (perkId === "extra_heart") {
    return t`Extra Heart`
  }
  if (perkId === "extra_stamina") {
    return t`Extra Stamina`
  }

  return t`Kevlar Vest`
}

export const localizePerkDetail = (perkId: PerkId, stacks: number) => {
  if (perkId === "laser_sight") {
    return t`Soft aim assist cone`
  }
  if (perkId === "ricochet_shells") {
    return t`Shotgun bounces x5`
  }
  if (perkId === "proximity_grenades") {
    return t`Grenades explode near enemies`
  }
  if (perkId === "rapid_reload") {
    return t`Reload speed +25%`
  }
  if (perkId === "heavy_pellets") {
    return t`Pellet size +50%, fire rate -25%, damage +1`
  }
  if (perkId === "extra_heart") {
    return t`Max HP +${stacks * 3}`
  }
  if (perkId === "extra_stamina") {
    return t`Move speed +12%`
  }

  return t`Damage taken -1 (min 1)`
}
