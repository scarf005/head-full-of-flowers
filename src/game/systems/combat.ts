import type { PrimaryWeaponId, Team } from "../types.ts"
import { randomRange } from "../utils.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import type { PrimaryWeaponSlot, Unit } from "../entities.ts"
import type { WorldState } from "../world/state.ts"
import { applyDamage as applyDamageCore, type DamageDeps, type DamageSource } from "./combat-damage.ts"
import {
  activePrimarySlot,
  completeReload,
  cyclePrimaryWeapon,
  equipPrimary,
  finishReload,
  getUnitById,
  pruneDepletedPrimarySlots,
  randomLootablePrimary,
  resetBurstState,
  startReload,
  swapToUsablePrimaryIfNeeded,
  syncUnitPrimaryFromSlot,
} from "./combat-arsenal.ts"

export { cyclePrimaryWeapon, equipPrimary, finishReload, randomLootablePrimary, startReload }

const AIM_ASSIST_MAX_DISTANCE = 24
const LASER_SIGHT_SPREAD_MULTIPLIER = 0.7

export interface FirePrimaryDeps {
  allocProjectile: () => WorldState["projectiles"][number]
  startReload: (unitId: string) => void
  onPlayerShoot: () => void
  onOtherShoot: () => void
  onMuzzleFlash?: (shooter: Unit, shotAngle: number, weaponId: PrimaryWeaponId) => void
  onPlayerBulletsFired?: (count: number) => void
  onPrimaryWeaponChanged?: (unitId: string) => void
  onShellEjected?: (shooter: Unit) => void
  onMagazineDiscarded?: (shooter: Unit, weaponId: PrimaryWeaponId) => void
}

const normalizeAngleDelta = (delta: number) => {
  let value = delta
  while (value > Math.PI) {
    value -= Math.PI * 2
  }
  while (value < -Math.PI) {
    value += Math.PI * 2
  }
  return value
}

const resolveAssistedAimAngle = (world: WorldState, shooter: Unit, fallbackAngle: number) => {
  const cone = shooter.aimAssistRadians
  if (cone <= 0) {
    return fallbackAngle
  }

  const maxAimAssistDistanceSquared = AIM_ASSIST_MAX_DISTANCE * AIM_ASSIST_MAX_DISTANCE

  let bestDelta = 0
  let bestScore = Number.POSITIVE_INFINITY

  for (const candidate of world.units) {
    if (candidate.id === shooter.id || candidate.team === shooter.team || candidate.hp <= 0) {
      continue
    }

    const dx = candidate.position.x - shooter.position.x
    const dy = candidate.position.y - shooter.position.y
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared <= 0.000001 || distanceSquared > maxAimAssistDistanceSquared) {
      continue
    }

    const targetAngle = Math.atan2(dy, dx)
    const delta = normalizeAngleDelta(targetAngle - fallbackAngle)
    const absDelta = Math.abs(delta)
    if (absDelta > cone) {
      continue
    }

    const distance = Math.sqrt(distanceSquared)
    const score = absDelta * 8 + distance
    if (score >= bestScore) {
      continue
    }

    bestScore = score
    bestDelta = delta
  }

  if (!Number.isFinite(bestScore)) {
    return fallbackAngle
  }

  return fallbackAngle + bestDelta * 0.62
}

const emitPrimaryShot = (
  world: WorldState,
  shooter: Unit,
  weapon: (typeof PRIMARY_WEAPONS)[PrimaryWeaponId],
  deps: FirePrimaryDeps,
  shotIndex: number,
  shotsTotal: number,
  burstSpread: number,
) => {
  const projectileKind = weapon.projectileKind ?? (weapon.id === "flamethrower" ? "flame" : "ballistic")
  const pelletsPerShot = Math.max(1, weapon.pellets)
  const baseAngle = resolveAssistedAimAngle(world, shooter, Math.atan2(shooter.aim.y, shooter.aim.x))
  const centeredBurstOffset = (shotIndex - (shotsTotal - 1) * 0.5) * burstSpread
  const shotAngle = baseAngle + centeredBurstOffset
  const hasLaserSight = shooter.laserSight || (shooter.perkStacks.laser_sight ?? 0) > 0
  const spreadMultiplier = hasLaserSight ? LASER_SIGHT_SPREAD_MULTIPLIER : 1
  const spreadRange = weapon.spread * spreadMultiplier

  shooter.recoil = Math.min(1, shooter.recoil + 0.38 + pelletsPerShot * 0.05)
  deps.onShellEjected?.(shooter)
  deps.onMuzzleFlash?.(shooter, shotAngle, weapon.id)
  if (shooter.isPlayer) {
    deps.onPlayerBulletsFired?.(pelletsPerShot)
  }

  for (let pellet = 0; pellet < pelletsPerShot; pellet += 1) {
    const projectile = deps.allocProjectile()
    const spread = randomRange(-spreadRange, spreadRange)
    const angle = shotAngle + spread
    const dirX = Math.cos(angle)
    const dirY = Math.sin(angle)

    projectile.active = true
    projectile.kind = projectileKind
    projectile.ownerId = shooter.id
    projectile.ownerTeam = shooter.team
    projectile.position.x = shooter.position.x
    projectile.position.y = shooter.position.y
    projectile.velocity.x = dirX * weapon.speed * randomRange(1.02, 1.14)
    projectile.velocity.y = dirY * weapon.speed * randomRange(1.02, 1.14)
    projectile.radius = weapon.bulletRadius * shooter.bulletSizeMultiplier
    projectile.damage = Math.max(1, weapon.damage * shooter.damageMultiplier + shooter.projectileDamageBonus)
    projectile.maxRange = weapon.range * Math.max(0.1, shooter.projectileRangeMultiplier)
    projectile.traveled = 0
    projectile.ttl = Math.max(0.3, weapon.range / Math.max(1, weapon.speed) * 1.6)
    projectile.glow = projectileKind === "flame"
      ? randomRange(0.5, 0.95)
      : projectileKind === "rocket"
      ? randomRange(0.85, 1.2)
      : randomRange(0.4, 0.9)
    projectile.trailCooldown = 0
    projectile.trailX = projectile.position.x
    projectile.trailY = projectile.position.y
    projectile.trailReady = false
    projectile.ricochets = 0
    projectile.ballisticRicochetRemaining =
      shooter.shotgunRicochet && (weapon.id === "shotgun" || weapon.id === "auto-shotgun") ? 5 : 0
    projectile.contactFuse = shooter.proximityGrenades && projectileKind === "grenade"
    projectile.explosiveRadiusMultiplier = shooter.explosiveRadiusMultiplier
    projectile.proximityRadiusBonus = Math.max(0, shooter.projectileProximityBonus)
    projectile.acceleration = Math.max(0, weapon.projectileAcceleration ?? 0)
  }

  if (shooter.isPlayer) {
    const impactFeel = Math.max(1, Math.min(2, world.impactFeelLevel || 1))
    const shakeScale = 1 + (impactFeel - 1) * 1.2
    world.cameraShake = Math.min(1.3 + (impactFeel - 1) * 0.9, world.cameraShake + 0.1 * shakeScale)
    deps.onPlayerShoot()
  } else if (Math.random() > 0.82) {
    deps.onOtherShoot()
  }
}

const canShootFromSlot = (slot: PrimaryWeaponSlot) => {
  return !Number.isFinite(slot.primaryAmmo) || slot.primaryAmmo > 0
}

const postShotAmmoHandling = (shooter: Unit, deps: FirePrimaryDeps) => {
  const weaponSlot = activePrimarySlot(shooter)
  const shouldDiscardMagazine = Number.isFinite(weaponSlot.primaryAmmo) &&
    weaponSlot.primaryAmmo <= 0 &&
    weaponSlot.weaponId !== "pistol"

  if (shouldDiscardMagazine) {
    deps.onMagazineDiscarded?.(shooter, weaponSlot.weaponId)
  }

  if (Number.isFinite(weaponSlot.primaryAmmo) && weaponSlot.primaryAmmo <= 0) {
    swapToUsablePrimaryIfNeeded(shooter, deps.onPrimaryWeaponChanged)
    const activeSlot = activePrimarySlot(shooter)
    const hasReserve = !Number.isFinite(activeSlot.reserveAmmo) || activeSlot.reserveAmmo > 0
    if (hasReserve && Number.isFinite(activeSlot.primaryAmmo) && activeSlot.primaryAmmo <= 0) {
      deps.startReload(shooter.id)
    }
  }

  if (pruneDepletedPrimarySlots(shooter)) {
    syncUnitPrimaryFromSlot(shooter)
    deps.onPrimaryWeaponChanged?.(shooter.id)
  }
}

const fireQueuedBurstShot = (world: WorldState, shooter: Unit, deps: FirePrimaryDeps) => {
  if (shooter.burstShotsRemaining <= 0 || !shooter.burstWeaponId) {
    resetBurstState(shooter)
    return
  }

  const slot = activePrimarySlot(shooter)
  if (slot.weaponId !== shooter.burstWeaponId || !canShootFromSlot(slot)) {
    resetBurstState(shooter)
    postShotAmmoHandling(shooter, deps)
    return
  }

  const weapon = PRIMARY_WEAPONS[slot.weaponId]
  if (Number.isFinite(slot.primaryAmmo)) {
    slot.primaryAmmo = Math.max(0, slot.primaryAmmo - 1)
  }
  syncUnitPrimaryFromSlot(shooter)

  emitPrimaryShot(world, shooter, weapon, deps, shooter.burstShotIndex, shooter.burstTotalShots, shooter.burstSpread)

  shooter.burstShotIndex += 1
  shooter.burstShotsRemaining -= 1

  const fireRateScale = Math.max(0.01, shooter.fireRateMultiplier)
  if (shooter.burstShotsRemaining > 0) {
    shooter.shootCooldown = shooter.burstInterval / fireRateScale
  } else {
    const spentBurstTime = shooter.burstInterval * Math.max(0, shooter.burstTotalShots - 1)
    const postBurstCooldown = Math.max(0, weapon.cooldown - spentBurstTime)
    shooter.shootCooldown = postBurstCooldown / fireRateScale
    resetBurstState(shooter)
  }

  postShotAmmoHandling(shooter, deps)
}

export const continueBurstFire = (world: WorldState, shooterId: string, deps: FirePrimaryDeps) => {
  const shooter = getUnitById(world, shooterId)
  if (!shooter || shooter.shootCooldown > 0 || shooter.reloadCooldown > 0) {
    return
  }

  if (shooter.burstShotsRemaining <= 0) {
    return
  }

  fireQueuedBurstShot(world, shooter, deps)
}

export const firePrimary = (world: WorldState, shooterId: string, deps: FirePrimaryDeps) => {
  const shooter = getUnitById(world, shooterId)
  if (!shooter || shooter.shootCooldown > 0 || shooter.reloadCooldown > 0) {
    return
  }

  if (shooter.burstShotsRemaining > 0) {
    fireQueuedBurstShot(world, shooter, deps)
    return
  }

  if (pruneDepletedPrimarySlots(shooter)) {
    syncUnitPrimaryFromSlot(shooter)
    deps.onPrimaryWeaponChanged?.(shooter.id)
  }

  const slot = activePrimarySlot(shooter)

  if (Number.isFinite(slot.primaryAmmo) && slot.primaryAmmo <= 0) {
    swapToUsablePrimaryIfNeeded(shooter, deps.onPrimaryWeaponChanged)
    const activeSlot = activePrimarySlot(shooter)

    if (Number.isFinite(activeSlot.primaryAmmo) && activeSlot.primaryAmmo <= 0) {
      const hasReserve = !Number.isFinite(activeSlot.reserveAmmo) || activeSlot.reserveAmmo > 0
      if (hasReserve) {
        if (shooter.reloadCooldownMax <= 0) {
          deps.startReload(shooter.id)
        }
      }

      return
    }
  }

  const weaponSlot = activePrimarySlot(shooter)
  const weapon = PRIMARY_WEAPONS[weaponSlot.weaponId]
  const burstShots = Math.max(1, Math.floor(weapon.burstShots ?? 1))
  const burstSpread = Math.max(0, weapon.burstSpread ?? weapon.spread * 0.24)
  const shotsToFire = Number.isFinite(weaponSlot.primaryAmmo)
    ? Math.max(1, Math.min(burstShots, Math.floor(weaponSlot.primaryAmmo)))
    : burstShots

  if (shotsToFire <= 0) {
    return
  }

  if (burstShots > 1) {
    const burstInterval = Math.max(0, weapon.burstInterval ?? weapon.cooldown / Math.max(1, burstShots))
    shooter.burstShotsRemaining = shotsToFire
    shooter.burstTotalShots = shotsToFire
    shooter.burstShotIndex = 0
    shooter.burstSpread = burstSpread
    shooter.burstInterval = burstInterval
    shooter.burstWeaponId = weapon.id
    fireQueuedBurstShot(world, shooter, deps)
    return
  }

  if (Number.isFinite(weaponSlot.primaryAmmo)) {
    weaponSlot.primaryAmmo = Math.max(0, weaponSlot.primaryAmmo - 1)
  }
  syncUnitPrimaryFromSlot(shooter)
  shooter.shootCooldown = weapon.cooldown / Math.max(0.01, shooter.fireRateMultiplier)
  emitPrimaryShot(world, shooter, weapon, deps, 0, 1, 0)
  postShotAmmoHandling(shooter, deps)
}

export const applyDamage = (
  world: WorldState,
  targetId: string,
  amount: number,
  sourceId: string,
  sourceTeam: Team,
  hitX: number,
  hitY: number,
  impactX: number,
  impactY: number,
  deps: DamageDeps,
  damageSource: DamageSource = "other",
) => {
  applyDamageCore(world, targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, {
    ...deps,
    completeReload,
  }, damageSource)
}
