import { t } from "@lingui/core/macro"
import { localizePerk, localizePrimaryWeapon } from "./i18n/localize.ts"
import { applyPerkToUnit, perkStacks } from "./perks.ts"
import { menuStartDifficultySignal, statusMessageSignal } from "./signals.ts"
import { continueBurstFire } from "./systems/combat.ts"
import {
  constrainUnitsToArena,
  damageObstaclesByExplosion,
  hitObstacle,
  resolveUnitCollisions,
  updateObstacleFlash,
} from "./systems/collisions.ts"
import { applyExplosionImpulse, explodeProjectilePayload } from "./systems/explosion-effects.ts"
import {
  cullHiddenDamagePopups,
  emitProjectileTrailEnd,
  emitThrowableTrailEnd,
  updateFlightTrailEmitters,
  updateFlightTrails,
} from "./systems/flight-trails.ts"
import { updateDamagePopups, updateFlowers } from "./systems/flowers.ts"
import { igniteMolotov, spawnFlamePatch, updateMolotovZones } from "./systems/molotov.ts"
import {
  canCollectWeaponPickup,
  collectNearbyPickup,
  type CollectPickupDeps,
  updatePickups,
} from "./systems/pickups.ts"
import { updateCombatFeel, updateCrosshairWorld, updatePlayer, type UpdatePlayerDeps } from "./systems/player.ts"
import { updateProjectiles } from "./systems/projectiles.ts"
import { explodeGrenade, updateThrowables } from "./systems/throwables.ts"
import { updateAI, type UpdateAIDeps } from "./systems/ai.ts"
import { clamp, lerp } from "./utils.ts"
import { EFFECT_SPEED, MATCH_DURATION_SECONDS } from "./world/constants.ts"
import { updateShellCasingsFx } from "./systems/shell-fx.ts"
import type { FlowerArenaGame } from "./game.ts"

interface StableUnitUpdateDeps {
  player: UpdatePlayerDeps
  ai: UpdateAIDeps
}

interface StableFrameUpdateDeps {
  arenaBoundary: NonNullable<Parameters<typeof constrainUnitsToArena>[2]>
  projectiles: Parameters<typeof updateProjectiles>[2]
  throwables: Parameters<typeof updateThrowables>[2]
  molotov: Parameters<typeof updateMolotovZones>[2]
  pickups: Parameters<typeof updatePickups>[2]
}

const stableUnitUpdateDepsCache = new WeakMap<FlowerArenaGame, StableUnitUpdateDeps>()
const stableFrameUpdateDepsCache = new WeakMap<FlowerArenaGame, StableFrameUpdateDeps>()

const stableUnitUpdateDepsForGame = (game: FlowerArenaGame): StableUnitUpdateDeps => {
  const cached = stableUnitUpdateDepsCache.get(game)
  if (cached) {
    return cached
  }

  const equipPrimary: CollectPickupDeps["equipPrimary"] = (unit, weaponId, ammo) =>
    game.equipPrimary(unit.id, weaponId, ammo)
  const applyPerk: CollectPickupDeps["applyPerk"] = (unit, perkId) => applyPerkToUnit(unit, perkId)
  const readPerkStacks: CollectPickupDeps["perkStacks"] = (unit, perkId) => perkStacks(unit, perkId)
  const shouldCollectPickup: NonNullable<CollectPickupDeps["shouldCollectPickup"]> = (unit, pickup) =>
    pickup.kind === "perk" || canCollectWeaponPickup(unit, pickup.weapon)

  const playerPickupDeps: CollectPickupDeps = {
    equipPrimary,
    applyPerk,
    perkStacks: readPerkStacks,
    onPlayerPickup: (weaponId) => {
      game.sfx.itemAcquire()
      const localizedWeapon = localizePrimaryWeapon(weaponId)
      statusMessageSignal.value = t`Picked up ${localizedWeapon}`
    },
    onPlayerPerkPickup: (perkId, stacks) => {
      game.sfx.itemAcquire()
      const localizedPerk = localizePerk(perkId)
      statusMessageSignal.value = stacks > 1
        ? t`Perk acquired ${localizedPerk} x${stacks}`
        : t`Perk acquired ${localizedPerk}`
    },
    shouldCollectPickup,
  }

  const botPickupDeps: CollectPickupDeps = {
    equipPrimary,
    applyPerk,
    perkStacks: readPerkStacks,
    onPlayerPickup: () => {},
    onPlayerPerkPickup: () => {},
    shouldCollectPickup,
  }

  const created: StableUnitUpdateDeps = {
    player: {
      firePrimary: () => game.firePrimary(game.world.player.id),
      continueBurst: () => continueBurstFire(game.world, game.world.player.id, game.primaryFireDeps()),
      startReload: () => game.startReload(game.world.player.id),
      throwSecondary: () => game.throwSecondary(game.world.player.id),
      swapPrimary: (direction) => game.swapPrimary(game.world.player.id, direction),
      collectNearbyPickup: () => collectNearbyPickup(game.world, game.world.player, playerPickupDeps),
      updateCrosshairWorld: () => updateCrosshairWorld(game.world),
    },
    ai: {
      firePrimary: (botId) => game.firePrimary(botId),
      continueBurst: (botId) => continueBurstFire(game.world, botId, game.primaryFireDeps()),
      throwSecondary: (botId) => game.throwSecondary(botId),
      finishReload: (botId) => game.finishReload(botId),
      collectNearbyPickup: (botId) => {
        const bot = game.getUnit(botId)
        if (bot) {
          collectNearbyPickup(game.world, bot, botPickupDeps)
        }
      },
      nowMs: () => (MATCH_DURATION_SECONDS - game.world.timeRemaining) * 1000,
    },
  }

  stableUnitUpdateDepsCache.set(game, created)
  return created
}

const stableFrameUpdateDepsForGame = (game: FlowerArenaGame): StableFrameUpdateDeps => {
  const cached = stableFrameUpdateDepsCache.get(game)
  if (cached) {
    return cached
  }

  const onSfxHit = () => game.sfx.hit()
  const onSfxBreak = () => game.sfx.obstacleBreak()
  const onObstacleDamaged = (x: number, y: number, material: number, damage: number) =>
    game.spawnObstacleChipFx(x, y, material, damage)
  const onObstacleDestroyed = (x: number, y: number, material: number) => game.spawnObstacleDebris(x, y, material)
  const onBoxDestroyed = (x: number, y: number, highTier: boolean) =>
    game.spawnLootPickupAt(x, y, true, highTier, highTier)
  const allocMolotovZone = () => game.allocMolotovZone()

  const obstacleDamageDeps: Parameters<typeof hitObstacle>[2] = {
    onSfxHit,
    onSfxBreak,
    onObstacleDamaged,
    onObstacleDestroyed,
    onBoxDestroyed,
  }

  const projectileExplosionDeps: Parameters<typeof explodeProjectilePayload>[2] = {
    applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
      game.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "projectile")
    },
    spawnExplosion: (x, y, radius) => game.spawnExplosion(x, y, radius),
    onSfxHit,
    onSfxBreak,
    onObstacleDamaged,
    onObstacleDestroyed,
    onBoxDestroyed,
    onExplosion: (weaponId) => game.sfx.explosion(weaponId),
  }

  const grenadeExplosionDeps: Parameters<typeof explodeGrenade>[2] = {
    applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
      game.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "throwable")
    },
    damageObstaclesByExplosion: (x, y, radius) => {
      damageObstaclesByExplosion(game.world, x, y, radius, obstacleDamageDeps)
    },
    spawnExplosion: (x, y, radius) => game.spawnExplosion(x, y, radius),
    applyExplosionImpulse: (x, y, radius, explosivePower, sourceId, sourceTeam) => {
      applyExplosionImpulse(game.world, x, y, radius, explosivePower, sourceId, sourceTeam)
    },
  }

  const created: StableFrameUpdateDeps = {
    arenaBoundary: {
      onArenaBoundaryDamage: (targetId, amount, sourceId, hitX, hitY, impactX, impactY) => {
        game.applyDamage(targetId, amount, sourceId, game.world.player.team, hitX, hitY, impactX, impactY, "arena")
      },
    },
    projectiles: {
      hitObstacle: (projectileIndex) => {
        const projectile = game.world.projectiles[projectileIndex]
        return hitObstacle(game.world, projectile, obstacleDamageDeps)
      },
      spawnFlamePatch: (x, y, ownerId, ownerTeam) => {
        spawnFlamePatch(game.world, x, y, ownerId, ownerTeam, allocMolotovZone)
      },
      explodeProjectile: (projectile) => explodeProjectilePayload(game.world, projectile, projectileExplosionDeps),
      onTrailEnd: (x, y, velocityX, velocityY, kind) => {
        emitProjectileTrailEnd(game.world, x, y, velocityX, velocityY, kind)
      },
      applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
        game.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "projectile")
      },
    },
    throwables: {
      applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
        game.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "throwable")
      },
      explodeGrenade: (throwableIndex) => explodeGrenade(game.world, throwableIndex, grenadeExplosionDeps),
      igniteMolotov: (throwableIndex) => {
        const throwable = game.world.throwables[throwableIndex]
        if (throwable) {
          igniteMolotov(game.world, throwable, allocMolotovZone)
        }
      },
      onTrailEnd: (x, y, velocityX, velocityY, mode) => {
        emitThrowableTrailEnd(game.world, x, y, velocityX, velocityY, mode)
      },
      onExplosion: (mode) => game.sfx.explosion(mode === "grenade" ? "grenade-launcher" : undefined),
      onObstacleDamaged,
    },
    molotov: {
      applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
        game.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "molotov")
      },
    },
    pickups: {
      randomLootablePrimary: () => {
        const id = game.randomLootablePrimaryForMatch()
        return id === "pistol" ? "assault" : id
      },
      randomHighTierPrimary: () => game.randomHighTierPrimary(),
      highTierChance: 0,
      applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
        game.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "throwable")
      },
    },
  }

  stableFrameUpdateDepsCache.set(game, created)
  return created
}

export function updateGame(game: FlowerArenaGame, frameDt: number, gameplayDt: number) {
  game.syncPlayerOptions()

  const menuStartDifficulty = menuStartDifficultySignal.value
  if (!game.world.started && !game.world.finished && menuStartDifficulty) {
    game.beginMatch(menuStartDifficulty)
  }

  const effectDt = frameDt * EFFECT_SPEED

  if (game.world.paused) {
    updateCrosshairWorld(game.world)
    game.syncHudSignalsThrottled(frameDt)
    return
  }

  game.world.camera.x = lerp(game.world.camera.x, game.world.player.position.x, clamp(gameplayDt * 10, 0, 1))
  game.world.camera.y = lerp(game.world.camera.y, game.world.player.position.y, clamp(gameplayDt * 10, 0, 1))
  updateCombatFeel(game.world, gameplayDt)
  updateObstacleFlash(game.world, gameplayDt)

  game.applyDebugOverrides()

  const simDt = game.world.hitStop > 0 ? gameplayDt * 0.12 : gameplayDt
  game.world.hitStop = Math.max(0, game.world.hitStop - gameplayDt)
  const fxCullBounds = game.buildFogCullBounds()

  if (!game.world.running) {
    updateFlowers(game.world, effectDt)
    updateDamagePopups(game.world, effectDt)
    game.updateObstacleDebris(effectDt, fxCullBounds)
    game.updateRagdolls(effectDt)
    game.updateKillPetals(effectDt, fxCullBounds)
    updateShellCasingsFx(game.world, effectDt, fxCullBounds)
    updateFlightTrails(game.world, effectDt, fxCullBounds)
    cullHiddenDamagePopups(game.world, fxCullBounds)
    game.updateExplosions(effectDt)
    updateCrosshairWorld(game.world)
    return
  }

  game.world.timeRemaining -= gameplayDt
  if (game.world.timeRemaining <= 0) {
    game.world.timeRemaining = 0
    game.finishMatch()
  }

  const shrinkProgress = 1 - game.world.timeRemaining / MATCH_DURATION_SECONDS
  game.world.arenaRadius = lerp(game.matchArenaStartRadius, game.matchArenaEndRadius, clamp(shrinkProgress, 0, 1))

  const unitUpdateDeps = stableUnitUpdateDepsForGame(game)
  const frameUpdateDeps = stableFrameUpdateDepsForGame(game)
  updatePlayer(game.world, gameplayDt, unitUpdateDeps.player)
  game.sfx.updateContinuousWeaponSfx(
    game.world.player.primaryWeapon,
    game.world.player.primaryAmmo,
    game.world.player.reloadCooldown,
    game.world.input.leftDown,
  )

  if (game.world.player.reloadCooldown <= 0) {
    game.finishReload(game.world.player.id)
  }

  updateAI(game.world, gameplayDt, unitUpdateDeps.ai)

  resolveUnitCollisions(game.world)
  constrainUnitsToArena(game.world, simDt, frameUpdateDeps.arenaBoundary)
  updateProjectiles(game.world, simDt, frameUpdateDeps.projectiles)
  updateThrowables(game.world, simDt, frameUpdateDeps.throwables)
  updateMolotovZones(game.world, simDt, frameUpdateDeps.molotov)

  updateFlowers(game.world, effectDt)
  updateDamagePopups(game.world, effectDt)
  game.updateObstacleDebris(effectDt, fxCullBounds)
  game.updateRagdolls(effectDt)
  game.updateKillPetals(effectDt, fxCullBounds)
  updateShellCasingsFx(game.world, effectDt, fxCullBounds)
  updateFlightTrailEmitters(game.world, fxCullBounds)
  updateFlightTrails(game.world, effectDt, fxCullBounds)
  cullHiddenDamagePopups(game.world, fxCullBounds)

  frameUpdateDeps.pickups.highTierChance = game.highTierLootBoxChance()
  updatePickups(game.world, simDt, frameUpdateDeps.pickups)

  game.world.lootBoxTimer -= simDt
  if (game.world.lootBoxTimer <= 0) {
    game.spawnRandomWhiteLootBox()
    game.world.lootBoxTimer = game.whiteLootBoxSpawnIntervalSeconds()
  }

  game.updateExplosions(effectDt)
  game.syncHudSignalsThrottled(frameDt)
}
