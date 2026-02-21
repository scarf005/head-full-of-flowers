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
import { collectNearbyPickup, updatePickups } from "./systems/pickups.ts"
import { updateCombatFeel, updateCrosshairWorld, updatePlayer } from "./systems/player.ts"
import { updateProjectiles } from "./systems/projectiles.ts"
import { explodeGrenade, updateThrowables } from "./systems/throwables.ts"
import { updateAI } from "./systems/ai.ts"
import { clamp, lerp } from "./utils.ts"
import { EFFECT_SPEED, MATCH_DURATION_SECONDS } from "./world/constants.ts"
import { updateShellCasingsFx } from "./systems/shell-fx.ts"
import type { FlowerArenaGame } from "./game.ts"

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

  updatePlayer(game.world, gameplayDt, {
    firePrimary: () => game.firePrimary(game.world.player.id),
    continueBurst: () => continueBurstFire(game.world, game.world.player.id, game.primaryFireDeps()),
    startReload: () => game.startReload(game.world.player.id),
    throwSecondary: () => game.throwSecondary(game.world.player.id),
    collectNearbyPickup: () => {
      collectNearbyPickup(game.world, game.world.player, {
        equipPrimary: (unit, weaponId, ammo) => game.equipPrimary(unit.id, weaponId, ammo),
        applyPerk: (unit, perkId) => applyPerkToUnit(unit, perkId),
        perkStacks: (unit, perkId) => perkStacks(unit, perkId),
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
      })
    },
    updateCrosshairWorld: () => updateCrosshairWorld(game.world),
  })

  if (game.world.player.reloadCooldown <= 0) {
    game.finishReload(game.world.player.id)
  }

  updateAI(game.world, gameplayDt, {
    firePrimary: (botId) => game.firePrimary(botId),
    continueBurst: (botId) => continueBurstFire(game.world, botId, game.primaryFireDeps()),
    throwSecondary: (botId) => game.throwSecondary(botId),
    finishReload: (botId) => game.finishReload(botId),
    collectNearbyPickup: (botId) => {
      const bot = game.getUnit(botId)
      if (!bot) {
        return
      }
      collectNearbyPickup(game.world, bot, {
        equipPrimary: (unit, weaponId, ammo) => game.equipPrimary(unit.id, weaponId, ammo),
        applyPerk: (unit, perkId) => applyPerkToUnit(unit, perkId),
        perkStacks: (unit, perkId) => perkStacks(unit, perkId),
        onPlayerPickup: () => {},
        onPlayerPerkPickup: () => {},
      })
    },
    nowMs: () => performance.now(),
  })

  resolveUnitCollisions(game.world)
  constrainUnitsToArena(game.world, simDt, {
    onArenaBoundaryDamage: (targetId, amount, sourceId, hitX, hitY, impactX, impactY) => {
      game.applyDamage(targetId, amount, sourceId, game.world.player.team, hitX, hitY, impactX, impactY, "arena")
    },
  })

  updateProjectiles(game.world, simDt, {
    hitObstacle: (projectileIndex) => {
      const projectile = game.world.projectiles[projectileIndex]
      return hitObstacle(game.world, projectile, {
        onSfxHit: () => game.sfx.hit(),
        onSfxBreak: () => game.sfx.obstacleBreak(),
        onObstacleDamaged: (x, y, material, damage) => game.spawnObstacleChipFx(x, y, material, damage),
        onObstacleDestroyed: (x, y, material) => game.spawnObstacleDebris(x, y, material),
        onBoxDestroyed: (x, y, highTier) => game.spawnLootPickupAt(x, y, true, highTier, highTier),
      })
    },
    spawnFlamePatch: (x, y, ownerId, ownerTeam) => {
      spawnFlamePatch(game.world, x, y, ownerId, ownerTeam, () => game.allocMolotovZone())
    },
    explodeProjectile: (projectile) => {
      explodeProjectilePayload(game.world, projectile, {
        applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
          game.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "projectile")
        },
        spawnExplosion: (x, y, radius) => game.spawnExplosion(x, y, radius),
        onSfxHit: () => game.sfx.hit(),
        onSfxBreak: () => game.sfx.obstacleBreak(),
        onObstacleDamaged: (x, y, material, damage) => game.spawnObstacleChipFx(x, y, material, damage),
        onObstacleDestroyed: (x, y, material) => game.spawnObstacleDebris(x, y, material),
        onBoxDestroyed: (x, y, highTier) => game.spawnLootPickupAt(x, y, true, highTier, highTier),
        onExplosion: () => game.sfx.explosion(),
      })
    },
    onTrailEnd: (x, y, velocityX, velocityY, kind) => {
      emitProjectileTrailEnd(game.world, x, y, velocityX, velocityY, kind)
    },
    applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
      game.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "projectile")
    },
  })

  updateThrowables(game.world, simDt, {
    applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
      game.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "throwable")
    },
    explodeGrenade: (throwableIndex) => {
      explodeGrenade(game.world, throwableIndex, {
        applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
          game.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "throwable")
        },
        damageObstaclesByExplosion: (x, y, radius) => {
          damageObstaclesByExplosion(game.world, x, y, radius, {
            onSfxHit: () => game.sfx.hit(),
            onSfxBreak: () => game.sfx.obstacleBreak(),
            onObstacleDamaged: (chipX, chipY, material, damage) =>
              game.spawnObstacleChipFx(chipX, chipY, material, damage),
            onObstacleDestroyed: (dropX, dropY, material) => game.spawnObstacleDebris(dropX, dropY, material),
            onBoxDestroyed: (dropX, dropY, highTier) => game.spawnLootPickupAt(dropX, dropY, true, highTier, highTier),
          })
        },
        spawnExplosion: (x, y, radius) => game.spawnExplosion(x, y, radius),
        applyExplosionImpulse: (x, y, radius, explosivePower, sourceId, sourceTeam) => {
          applyExplosionImpulse(game.world, x, y, radius, explosivePower, sourceId, sourceTeam)
        },
      })
    },
    igniteMolotov: (throwableIndex) => {
      const throwable = game.world.throwables[throwableIndex]
      if (!throwable) {
        return
      }
      igniteMolotov(game.world, throwable, () => game.allocMolotovZone())
    },
    onTrailEnd: (x, y, velocityX, velocityY, mode) => {
      emitThrowableTrailEnd(game.world, x, y, velocityX, velocityY, mode)
    },
    onExplosion: () => game.sfx.explosion(),
    onObstacleDamaged: (x, y, material, damage) => game.spawnObstacleChipFx(x, y, material, damage),
  })

  updateMolotovZones(game.world, simDt, {
    applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
      game.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "molotov")
    },
  })

  updateFlowers(game.world, effectDt)
  updateDamagePopups(game.world, effectDt)
  game.updateObstacleDebris(effectDt, fxCullBounds)
  game.updateRagdolls(effectDt)
  game.updateKillPetals(effectDt, fxCullBounds)
  updateShellCasingsFx(game.world, effectDt, fxCullBounds)
  updateFlightTrailEmitters(game.world, fxCullBounds)
  updateFlightTrails(game.world, effectDt, fxCullBounds)
  cullHiddenDamagePopups(game.world, fxCullBounds)

  updatePickups(game.world, simDt, {
    randomLootablePrimary: () => {
      const id = game.randomLootablePrimaryForMatch()
      return id === "pistol" ? "assault" : id
    },
    randomHighTierPrimary: () => game.randomHighTierPrimary(),
    highTierChance: game.highTierLootBoxChance(),
    applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
      game.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "throwable")
    },
  })

  game.world.lootBoxTimer -= simDt
  if (game.world.lootBoxTimer <= 0) {
    game.spawnRandomWhiteLootBox()
    game.world.lootBoxTimer = game.whiteLootBoxSpawnIntervalSeconds()
  }

  game.updateExplosions(effectDt)
  game.syncHudSignalsThrottled(frameDt)
}
