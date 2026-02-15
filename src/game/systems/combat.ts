import { sample } from "@std/random"

import type { PrimaryWeaponId } from "../types.ts"
import type { Team } from "../types.ts"
import { randomInt, randomRange } from "../utils.ts"
import { LOOTABLE_PRIMARY_IDS, PRIMARY_WEAPONS } from "../weapons.ts"
import type { Unit } from "../entities.ts"
import type { WorldState } from "../world/state.ts"
import { BURNED_FACTION_ID } from "../factions.ts"
import { randomFlowerBurst } from "./flowers.ts"
import { debugInfiniteHpSignal } from "../signals.ts"

export const randomLootablePrimary = (): PrimaryWeaponId => {
  return (sample(LOOTABLE_PRIMARY_IDS) as PrimaryWeaponId | undefined) ?? "assault"
}

const DEATH_FLOWER_AMOUNT_MULTIPLIER = 2
const DEATH_FLOWER_SIZE_SCALE_BOOST = 0.25
const KILL_CIRCLE_EXTRA_BURSTS = 3
const KILL_CIRCLE_EXTRA_AMOUNT_MULTIPLIER = 0.85
const KILL_CIRCLE_RADIUS_MIN = 0.2
const KILL_CIRCLE_RADIUS_MAX = 0.95

export const startReload = (unitId: string, world: WorldState, onPlayerReloading: () => void) => {
  const unit = world.units.find((candidate) => candidate.id === unitId)
  if (!unit || unit.reloadCooldown > 0) {
    return
  }

  const weapon = PRIMARY_WEAPONS[unit.primaryWeapon]
  if (!Number.isFinite(unit.primaryAmmo)) {
    return
  }

  const hasReserve = !Number.isFinite(unit.reserveAmmo) || unit.reserveAmmo > 0
  if (unit.primaryAmmo >= unit.magazineSize || !hasReserve) {
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

  if (!Number.isFinite(unit.primaryAmmo)) {
    return
  }

  const room = Math.max(0, unit.magazineSize - unit.primaryAmmo)
  if (room <= 0) {
    unit.reloadCooldownMax = 0
    return
  }

  if (Number.isFinite(unit.reserveAmmo) && unit.reserveAmmo <= 0) {
    unit.reloadCooldownMax = 0
    return
  }

  const moved = Number.isFinite(unit.reserveAmmo) ? Math.min(room, unit.reserveAmmo) : room
  unit.primaryAmmo += moved
  if (Number.isFinite(unit.reserveAmmo)) {
    unit.reserveAmmo -= moved
  }
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
  onPlayerWeaponUpdate: () => void,
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
  if (Number.isFinite(config.magazineSize) && !Number.isFinite(normalizedAmmo)) {
    unit.primaryAmmo = config.magazineSize
    unit.reserveAmmo = Number.POSITIVE_INFINITY
  } else if (Number.isFinite(normalizedAmmo) && Number.isFinite(config.magazineSize)) {
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
  onPlayerShoot: () => void
  onOtherShoot: () => void
  onPlayerBulletsFired?: (count: number) => void
  onPrimaryWeaponChanged?: (unitId: string) => void
  onShellEjected?: (shooter: Unit) => void
}

const swapToPistolIfNeeded = (world: WorldState, shooter: Unit, onPrimaryWeaponChanged?: (unitId: string) => void) => {
  if (shooter.primaryWeapon === "pistol") {
    return
  }

  if (!Number.isFinite(shooter.primaryAmmo)) {
    return
  }

  if (shooter.primaryAmmo > 0) {
    return
  }

  if (Number.isFinite(shooter.reserveAmmo) && shooter.reserveAmmo > 0) {
    return
  }

  equipPrimary(shooter.id, world, "pistol", Number.POSITIVE_INFINITY, () => {
    if (shooter.isPlayer && onPrimaryWeaponChanged) {
      onPrimaryWeaponChanged(shooter.id)
    }
  })
}

export const firePrimary = (world: WorldState, shooterId: string, deps: FirePrimaryDeps) => {
  const shooter = world.units.find((unit) => unit.id === shooterId)
  if (!shooter || shooter.shootCooldown > 0 || shooter.reloadCooldown > 0) {
    return
  }

  if (Number.isFinite(shooter.primaryAmmo) && shooter.primaryAmmo <= 0) {
    swapToPistolIfNeeded(world, shooter, deps.onPrimaryWeaponChanged)

    const hasReserve = !Number.isFinite(shooter.reserveAmmo) || shooter.reserveAmmo > 0
    if (hasReserve) {
      if (shooter.reloadCooldownMax <= 0) {
        deps.startReload(shooter.id)
      }
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
  if (shooter.isPlayer) {
    deps.onPlayerBulletsFired?.(pelletCount)
  }
  deps.onShellEjected?.(shooter)
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
    projectile.glow = shooter.primaryWeapon === "flamethrower" ? randomRange(0.5, 0.95) : randomRange(0.4, 0.9)
    projectile.trailCooldown = 0
    projectile.trailX = projectile.position.x
    projectile.trailY = projectile.position.y
    projectile.trailReady = false
  }

  if (Number.isFinite(shooter.primaryAmmo) && shooter.primaryAmmo <= 0) {
    swapToPistolIfNeeded(world, shooter, deps.onPrimaryWeaponChanged)

    const hasReserve = !Number.isFinite(shooter.reserveAmmo) || shooter.reserveAmmo > 0
    if (hasReserve) {
      deps.startReload(shooter.id)
    }
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

export interface DamageDeps {
  allocPopup: () => WorldState["damagePopups"][number]
  spawnFlowers: (
    ownerId: string,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    amount: number,
    sizeScale: number,
    isBurnt?: boolean,
    options?: {
      staggeredBloom?: boolean
    },
  ) => void
  respawnUnit: (unitId: string) => void
  onKillPetalBurst?: (x: number, y: number) => void
  onUnitKilled?: (target: Unit, isSuicide: boolean) => void
  onSfxHit: (isPlayerInvolved: boolean) => void
  onSfxDeath: () => void
  onSfxPlayerDeath: () => void
  onSfxPlayerKill: () => void
  onPlayerHit?: (targetId: string, damage: number) => void
  onPlayerKill?: (targetId: string) => void
  onPlayerHpChanged: () => void
}

const nearestUnitIdByTeam = (
  world: WorldState,
  team: Team,
  originX: number,
  originY: number,
  excludedUnitId: string,
) => {
  let nearestId = ""
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const unit of world.units) {
    if (unit.team !== team || unit.id === excludedUnitId) {
      continue
    }

    const distance = (unit.position.x - originX) ** 2 + (unit.position.y - originY) ** 2
    if (distance >= nearestDistance) {
      continue
    }

    nearestDistance = distance
    nearestId = unit.id
  }

  return nearestId
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
  damageSource: "projectile" | "throwable" | "molotov" | "arena" | "other" = "other",
) => {
  const target = world.units.find((unit) => unit.id === targetId)
  if (!target) {
    return
  }

  const impactFeel = Math.max(1, Math.min(2, world.impactFeelLevel || 1))
  const shakeScale = 1 + (impactFeel - 1) * 2
  const hitStopScale = 1 + (impactFeel - 1) * 2
  const shakeCapBoost = (impactFeel - 1) * 1.5

  const sourceUnit = world.units.find((unit) => unit.id === sourceId)
  const isSelfHarm = !!sourceUnit && sourceUnit.id === target.id
  const isBoundarySource = sourceId === "arena"
  const resolvedSourceTeam = sourceUnit?.team ?? sourceTeam

  if (!isBoundarySource && !isSelfHarm && resolvedSourceTeam === target.team) {
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
  const isPlayerSource = sourceId === world.player.id || sourceId === world.player.team || sourceUnit?.isPlayer === true
  const sourceByNearestTeam = sourceUnit?.id ??
    (!isBoundarySource && resolvedSourceTeam
      ? nearestUnitIdByTeam(world, resolvedSourceTeam, hitX, hitY, target.id)
      : "")
  let normalizedSourceId = isPlayerSource ? world.player.id : sourceByNearestTeam || sourceId

  const sourceIdIsUnit = sourceId.length > 0 ? world.units.some((unit) => unit.id === sourceId) : false
  const normalizedSourceIdIsUnit = normalizedSourceId.length > 0
    ? world.units.some((unit) => unit.id === normalizedSourceId)
    : false

  if (!isPlayerSource && !isBoundarySource && !sourceIdIsUnit && !normalizedSourceIdIsUnit) {
    const fallbackId = resolvedSourceTeam === world.player.team
      ? world.player.id
      : world.units.find((unit) => unit.team === resolvedSourceTeam && !unit.isPlayer)?.id

    if (fallbackId) {
      normalizedSourceId = fallbackId
    }
  }

  const flowerSourceId = isSelfHarm || isBoundarySource ? BURNED_FACTION_ID : normalizedSourceId
  const isBurntFlowers = isSelfHarm || isBoundarySource
  const isKilled = target.hp <= 0
  const staggeredBloom = isPlayerSource && target.id !== world.player.id && damageSource === "projectile"

  if (isKilled) {
    const deathBurst = randomFlowerBurst(damage, hitSpeed)
    let deathDirX = impactX
    let deathDirY = impactY
    if (Math.hypot(deathDirX, deathDirY) <= 0.0001) {
      const extraDir = randomRange(0, Math.PI * 2)
      deathDirX = Math.cos(extraDir)
      deathDirY = Math.sin(extraDir)
    }
    deps.spawnFlowers(
      flowerSourceId,
      hitX,
      hitY,
      deathDirX,
      deathDirY,
      Math.round(deathBurst.amount * DEATH_FLOWER_AMOUNT_MULTIPLIER),
      Math.min(1.9, deathBurst.sizeScale + DEATH_FLOWER_SIZE_SCALE_BOOST),
      isBurntFlowers,
      { staggeredBloom },
    )

    for (let burstIndex = 0; burstIndex < KILL_CIRCLE_EXTRA_BURSTS; burstIndex += 1) {
      const angle = randomRange(0, Math.PI * 2)
      const radius = randomRange(KILL_CIRCLE_RADIUS_MIN, KILL_CIRCLE_RADIUS_MAX)
      deps.spawnFlowers(
        flowerSourceId,
        target.position.x + Math.cos(angle) * radius,
        target.position.y + Math.sin(angle) * radius,
        Math.cos(angle),
        Math.sin(angle),
        Math.max(2, Math.round(deathBurst.amount * KILL_CIRCLE_EXTRA_AMOUNT_MULTIPLIER)),
        Math.min(2, deathBurst.sizeScale + DEATH_FLOWER_SIZE_SCALE_BOOST * 0.5),
        isBurntFlowers,
        { staggeredBloom: false },
      )
    }

    deps.onKillPetalBurst?.(target.position.x, target.position.y)
  } else {
    const flowerBurst = randomFlowerBurst(damage, hitSpeed)
    deps.spawnFlowers(
      flowerSourceId,
      hitX,
      hitY,
      impactX,
      impactY,
      flowerBurst.amount,
      flowerBurst.sizeScale,
      isBurntFlowers,
      { staggeredBloom },
    )
  }

  if (target.isPlayer && debugInfiniteHpSignal.value) {
    target.hp = target.maxHp
  }

  if (isPlayerSource && target.id !== world.player.id) {
    deps.onPlayerHit?.(target.id, damage)
  }

  if (isPlayerSource && target.id !== world.player.id) {
    world.cameraShake = Math.min(2.8 + shakeCapBoost, world.cameraShake + 0.48 * shakeScale)
    world.hitStop = Math.max(world.hitStop, 0.012 * hitStopScale)
  }

  if (target.isPlayer) {
    world.cameraShake = Math.min(3 + shakeCapBoost, world.cameraShake + 0.66 * shakeScale)
    world.hitStop = Math.max(world.hitStop, 0.016 * hitStopScale)
  }

  const impactLength = Math.hypot(impactX, impactY) || 1
  const impactDirX = impactX / impactLength
  const impactDirY = impactY / impactLength
  target.velocity.x += impactDirX * 2.7
  target.velocity.y += impactDirY * 2.7

  if (isPlayerSource && target.id !== world.player.id) {
    const offenseKick = 0.1 + (impactFeel - 1) * 0.22
    world.cameraKick.x += impactDirX * offenseKick
    world.cameraKick.y += impactDirY * offenseKick
  }

  if (target.isPlayer) {
    const defenseKick = 0.14 + (impactFeel - 1) * 0.32
    world.cameraKick.x -= impactDirX * defenseKick
    world.cameraKick.y -= impactDirY * defenseKick
  }

  const kickLength = Math.hypot(world.cameraKick.x, world.cameraKick.y)
  const kickCap = 0.3 + (impactFeel - 1) * 0.7
  if (kickLength > kickCap) {
    const scale = kickCap / kickLength
    world.cameraKick.x *= scale
    world.cameraKick.y *= scale
  }

  world.cameraShake = Math.min(1.15 + shakeCapBoost, world.cameraShake + 0.09 * shakeScale)

  if (isKilled) {
    deps.onUnitKilled?.(target, isSelfHarm)
    if (target.isPlayer) {
      deps.onSfxPlayerDeath()
    } else if (isPlayerSource && target.id !== world.player.id) {
      deps.onSfxPlayerKill()
    } else {
      deps.onSfxDeath()
    }
    if (isPlayerSource && target.id !== world.player.id) {
      deps.onPlayerKill?.(target.id)
    }
    deps.respawnUnit(target.id)
  } else {
    deps.onSfxHit(target.isPlayer || isPlayerSource)
  }

  if (target.isPlayer) {
    deps.onPlayerHpChanged()
  }
}
