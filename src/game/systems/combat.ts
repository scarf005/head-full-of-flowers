import { sample } from "@std/random"

import type { PrimaryWeaponId } from "../types.ts"
import { randomInt, randomRange } from "../utils.ts"
import { LOOTABLE_PRIMARY_IDS, PRIMARY_WEAPONS } from "../weapons.ts"
import type { WorldState } from "../world/state.ts"
import { randomFlowerBurst } from "./flowers.ts"

export const randomLootablePrimary = (): PrimaryWeaponId => {
  return (sample(LOOTABLE_PRIMARY_IDS) as PrimaryWeaponId | undefined) ?? "assault"
}

export const startReload = (unitId: string, world: WorldState, onPlayerReloading: () => void) => {
  const unit = world.units.find((candidate) => candidate.id === unitId)
  if (!unit || unit.reloadCooldown > 0) {
    return
  }

  const weapon = PRIMARY_WEAPONS[unit.primaryWeapon]
  if (!Number.isFinite(unit.primaryAmmo) || !Number.isFinite(unit.reserveAmmo)) {
    return
  }

  if (unit.primaryAmmo >= unit.magazineSize || unit.reserveAmmo <= 0) {
    return
  }

  if (weapon.reload <= 0) {
    return
  }

  unit.reloadCooldown = weapon.reload
  unit.reloadCooldownMax = weapon.reload
  if (unit.isPlayer) {
    onPlayerReloading()
  }
}

export const finishReload = (unitId: string, world: WorldState, onPlayerWeaponUpdate: () => void) => {
  const unit = world.units.find((candidate) => candidate.id === unitId)
  if (!unit || unit.reloadCooldown > 0 || unit.reloadCooldownMax <= 0) {
    return
  }

  if (!Number.isFinite(unit.primaryAmmo) || !Number.isFinite(unit.reserveAmmo)) {
    return
  }

  const room = Math.max(0, unit.magazineSize - unit.primaryAmmo)
  if (room <= 0 || unit.reserveAmmo <= 0) {
    unit.reloadCooldownMax = 0
    return
  }

  const moved = Math.min(room, unit.reserveAmmo)
  unit.primaryAmmo += moved
  unit.reserveAmmo -= moved
  unit.reloadCooldown = 0
  unit.reloadCooldownMax = 0
  if (unit.isPlayer) {
    onPlayerWeaponUpdate()
  }
}

export const equipPrimary = (
  unitId: string,
  world: WorldState,
  weaponId: PrimaryWeaponId,
  ammo: number,
  onPlayerWeaponUpdate: () => void
) => {
  const unit = world.units.find((candidate) => candidate.id === unitId)
  if (!unit) {
    return
  }

  const config = PRIMARY_WEAPONS[weaponId]
  unit.primaryWeapon = weaponId
  unit.magazineSize = config.magazineSize
  unit.reloadCooldown = 0
  unit.reloadCooldownMax = 0

  const normalizedAmmo = Number.isFinite(ammo) ? ammo : config.pickupAmmo
  if (Number.isFinite(normalizedAmmo) && Number.isFinite(config.magazineSize)) {
    unit.reserveAmmo = Math.max(0, normalizedAmmo)
    const loaded = Math.min(unit.magazineSize, unit.reserveAmmo)
    unit.primaryAmmo = loaded
    unit.reserveAmmo -= loaded
  } else {
    unit.primaryAmmo = Number.POSITIVE_INFINITY
    unit.reserveAmmo = Number.POSITIVE_INFINITY
  }

  if (unit.isPlayer) {
    onPlayerWeaponUpdate()
  }
}

export interface FirePrimaryDeps {
  allocProjectile: () => WorldState["projectiles"][number]
  startReload: (unitId: string) => void
  equipPrimary: (unitId: string, weaponId: PrimaryWeaponId, ammo: number) => void
  onPlayerShoot: () => void
  onOtherShoot: () => void
}

export const firePrimary = (world: WorldState, shooterId: string, deps: FirePrimaryDeps) => {
  const shooter = world.units.find((unit) => unit.id === shooterId)
  if (!shooter || shooter.shootCooldown > 0 || shooter.reloadCooldown > 0) {
    return
  }

  if (Number.isFinite(shooter.primaryAmmo) && shooter.primaryAmmo <= 0) {
    if (Number.isFinite(shooter.reserveAmmo) && shooter.reserveAmmo > 0) {
      deps.startReload(shooter.id)
      return
    }

    return
  }

  const weapon = PRIMARY_WEAPONS[shooter.primaryWeapon]

  shooter.shootCooldown = weapon.cooldown / shooter.fireRateMultiplier
  shooter.recoil = Math.min(1, shooter.recoil + 0.38 + weapon.pellets * 0.05)
  if (Number.isFinite(shooter.primaryAmmo)) {
    shooter.primaryAmmo = Math.max(0, shooter.primaryAmmo - 1)
  }

  const baseAngle = Math.atan2(shooter.aim.y, shooter.aim.x)
  const pelletCount = weapon.pellets
  for (let pellet = 0; pellet < pelletCount; pellet += 1) {
    const projectile = deps.allocProjectile()
    const spread = randomRange(-weapon.spread, weapon.spread)
    const angle = baseAngle + spread
    const dirX = Math.cos(angle)
    const dirY = Math.sin(angle)

    projectile.active = true
    projectile.kind = shooter.primaryWeapon === "flamethrower" ? "flame" : "ballistic"
    projectile.ownerId = shooter.id
    projectile.ownerTeam = shooter.team
    projectile.position.x = shooter.position.x
    projectile.position.y = shooter.position.y
    projectile.velocity.x = dirX * weapon.speed * randomRange(1.02, 1.14)
    projectile.velocity.y = dirY * weapon.speed * randomRange(1.02, 1.14)
    projectile.radius = weapon.bulletRadius * shooter.bulletSizeMultiplier
    projectile.damage = weapon.damage * shooter.damageMultiplier
    projectile.maxRange = weapon.range
    projectile.traveled = 0
    projectile.ttl = Math.max(0.3, weapon.range / Math.max(1, weapon.speed) * 1.6)
    projectile.glow = shooter.primaryWeapon === "flamethrower"
      ? randomRange(0.5, 0.95)
      : randomRange(0.4, 0.9)
  }

  if (Number.isFinite(shooter.primaryAmmo) && shooter.primaryAmmo <= 0) {
    if (Number.isFinite(shooter.reserveAmmo) && shooter.reserveAmmo > 0) {
      deps.startReload(shooter.id)
    } else {
      deps.equipPrimary(shooter.id, "pistol", Number.POSITIVE_INFINITY)
    }
  }

  if (shooter.isPlayer) {
    world.cameraShake = Math.min(1.1, world.cameraShake + 0.09)
    deps.onPlayerShoot()
  } else if (Math.random() > 0.82) {
    deps.onOtherShoot()
  }
}

export interface DamageDeps {
  allocPopup: () => WorldState["damagePopups"][number]
  spawnFlowers: (ownerId: string, x: number, y: number, dirX: number, dirY: number, amount: number, sizeScale: number) => void
  respawnUnit: (unitId: string) => void
  onSfxHit: () => void
  onSfxDeath: () => void
  onSfxPlayerDeath: () => void
  onSfxPlayerKill: () => void
  onPlayerHpChanged: () => void
}

const nearestEnemyId = (world: WorldState, sourceUnit: string, sourceTeam: "white" | "blue", targetX: number, targetY: number) => {
  const hostileTeam = sourceTeam === "white" ? "blue" : "white"
  let nearestEnemy = ""
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const unit of world.units) {
    if (unit.team !== hostileTeam || unit.id === sourceUnit) {
      continue
    }

    const distance = (unit.position.x - targetX) ** 2 + (unit.position.y - targetY) ** 2
    if (distance >= nearestDistance) {
      continue
    }

    nearestDistance = distance
    nearestEnemy = unit.id
  }

  return nearestEnemy
}

export const applyDamage = (
  world: WorldState,
  targetId: string,
  amount: number,
  sourceId: string,
  hitX: number,
  hitY: number,
  impactX: number,
  impactY: number,
  deps: DamageDeps
) => {
  const target = world.units.find((unit) => unit.id === targetId)
  if (!target) {
    return
  }

  const damage = Math.max(1, amount)
  target.hp = Math.max(0, target.hp - damage)
  target.hitFlash = 1
  target.recoil = Math.min(1, target.recoil + 0.45)

  const popup = deps.allocPopup()
  popup.active = true
  popup.position.set(target.position.x + randomRange(-0.4, 0.4), target.position.y - randomRange(0.6, 1.1))
  popup.velocity.set(randomRange(-1.3, 1.3), randomRange(2.8, 4.3))
  popup.text = `${Math.round(damage)}`
  popup.color = target.isPlayer ? "#8fc8ff" : "#fff6cc"
  popup.life = 0.62

  const hitSpeed = Math.hypot(impactX, impactY)
  const sourceUnit = world.units.find((unit) => unit.id === sourceId)
  const isSelfHarm = !!sourceUnit && sourceUnit.id === target.id
  const flowerSourceId = isSelfHarm
    ? nearestEnemyId(world, target.id, sourceUnit.team, target.position.x, target.position.y) || sourceId
    : sourceId

  const flowerBurst = randomFlowerBurst(damage, hitSpeed)
  deps.spawnFlowers(
    flowerSourceId,
    hitX,
    hitY,
    impactX,
    impactY,
    flowerBurst.amount,
    flowerBurst.sizeScale
  )

  if (sourceId === world.player.id) {
    world.cameraShake = Math.min(1.2, world.cameraShake + 0.12)
    world.hitStop = Math.max(world.hitStop, 0.012)
  }

  if (target.isPlayer) {
    world.cameraShake = Math.min(1.25, world.cameraShake + 0.18)
    world.hitStop = Math.max(world.hitStop, 0.016)
  }

  const impactLength = Math.hypot(impactX, impactY) || 1
  target.velocity.x += (impactX / impactLength) * 2.7
  target.velocity.y += (impactY / impactLength) * 2.7

  world.cameraShake = Math.min(1.15, world.cameraShake + 0.08)

  if (target.hp <= 0) {
    if (target.isPlayer) {
      deps.onSfxPlayerDeath()
    } else {
      deps.onSfxDeath()
    }
    if (sourceId === world.player.id && target.id !== world.player.id) {
      deps.onSfxPlayerKill()
    }
    deps.respawnUnit(target.id)
  } else {
    deps.onSfxHit()
  }

  if (target.isPlayer) {
    deps.onPlayerHpChanged()
  }
}
