import { botPalette } from "./factions.ts"
import { Flower, type Unit } from "./entities.ts"
import { localizePerk, localizePrimaryWeapon } from "./i18n/localize.ts"
import { applyPerkToUnit, perkStacks } from "./perks.ts"
import { debugInfiniteHpSignal, secondaryModeSignal, statusMessageSignal } from "./signals.ts"
import {
  applyDamage,
  cyclePrimaryWeapon,
  equipPrimary,
  finishReload,
  firePrimary,
  type FirePrimaryDeps,
  startReload,
} from "./systems/combat.ts"
import { type DamageSource } from "./systems/combat-damage.ts"
import { respawnUnit } from "./systems/respawn.ts"
import { throwSecondary } from "./systems/throwables.ts"
import { spawnDroppedMagazineFx, spawnMuzzleFlashFx, spawnShellCasingFx } from "./systems/shell-fx.ts"
import { spawnFlowers } from "./systems/flowers.ts"
import type { PrimaryWeaponId, Team } from "./types.ts"
import { updateCoverageSignals, updatePlayerHpSignal, updatePlayerWeaponSignals } from "./adapters/hud-sync.ts"
import { t } from "@lingui/core/macro"
import type { FlowerArenaGame } from "./game.ts"

export function allocProjectile(game: FlowerArenaGame) {
  const slot = game.world.projectiles[game.world.projectileCursor]
  game.world.projectileCursor = (game.world.projectileCursor + 1) % game.world.projectiles.length
  slot.trailCooldown = 0
  slot.trailDirX = 1
  slot.trailDirY = 0
  slot.trailReady = false
  slot.ricochets = 0
  slot.ballisticRicochetRemaining = 0
  slot.contactFuse = false
  slot.explosiveRadiusMultiplier = 1
  slot.proximityRadiusBonus = 0
  slot.acceleration = 0
  return slot
}

export function allocThrowable(game: FlowerArenaGame) {
  const slot = game.world.throwables[game.world.throwableCursor]
  game.world.throwableCursor = (game.world.throwableCursor + 1) % game.world.throwables.length
  slot.trailCooldown = 0
  slot.trailDirX = 1
  slot.trailDirY = 0
  slot.trailReady = false
  slot.contactFuse = false
  slot.explosiveRadiusMultiplier = 1
  return slot
}

export function allocFlower(game: FlowerArenaGame) {
  if (game.world.flowers.length > 0) {
    const index = game.world.flowerCursor % game.world.flowers.length
    const slot = game.world.flowers[index]
    if (slot.slotIndex !== index) {
      slot.slotIndex = index
    }
    game.world.flowerCursor = (index + 1) % game.world.flowers.length
    if (!slot.active) {
      return slot
    }
  }

  const spawned = new Flower()
  spawned.slotIndex = game.world.flowers.length
  game.world.flowers.push(spawned)
  if (game.world.flowers.length > 0) {
    game.world.flowerCursor = game.world.flowerCursor % game.world.flowers.length
  } else {
    game.world.flowerCursor = 0
  }
  return spawned
}

export function allocPopup(game: FlowerArenaGame) {
  const slot = game.world.damagePopups[game.world.popupCursor]
  game.world.popupCursor = (game.world.popupCursor + 1) % game.world.damagePopups.length
  return slot
}

export function allocMolotovZone(game: FlowerArenaGame) {
  const slot = game.world.molotovZones[game.world.molotovCursor]
  game.world.molotovCursor = (game.world.molotovCursor + 1) % game.world.molotovZones.length
  return slot
}

export function getUnit(game: FlowerArenaGame, id: string) {
  return game.world.unitById.get(id)
}

export function equipPrimaryForGame(game: FlowerArenaGame, unitId: string, weaponId: PrimaryWeaponId, ammo: number) {
  return equipPrimary(unitId, game.world, weaponId, ammo, () => updatePlayerWeaponSignals(game.world))
}

export function startReloadForGame(game: FlowerArenaGame, unitId: string) {
  const unit = getUnit(game, unitId)
  const wasReloading = (unit?.reloadCooldownMax ?? 0) > 0
  startReload(unitId, game.world, () => updatePlayerWeaponSignals(game.world))
  if (unit?.isPlayer && !wasReloading && unit.reloadCooldownMax > 0) {
    game.sfx.reloadBegin()
  }
}

export function finishReloadForGame(game: FlowerArenaGame, unitId: string) {
  const unit = getUnit(game, unitId)
  const wasReloading = (unit?.reloadCooldownMax ?? 0) > 0
  const ammoBefore = unit?.primaryAmmo ?? 0
  finishReload(unitId, game.world, () => updatePlayerWeaponSignals(game.world))
  if (unit?.isPlayer && wasReloading && unit.reloadCooldownMax <= 0 && unit.primaryAmmo > ammoBefore) {
    game.sfx.reloadEnd()
  }
}

export function primaryFireDepsForGame(game: FlowerArenaGame): FirePrimaryDeps {
  return {
    allocProjectile: () => allocProjectile(game),
    startReload: (id) => startReloadForGame(game, id),
    onShellEjected: (shooter) => {
      game.shellCasingCursor = spawnShellCasingFx(game.world, game.shellCasingCursor, shooter)
    },
    onMagazineDiscarded: (shooter, weaponId) => {
      game.shellCasingCursor = spawnDroppedMagazineFx(game.world, game.shellCasingCursor, shooter, weaponId)
    },
    onMuzzleFlash: (shooter, shotAngle, weaponId) => {
      game.muzzleFlashCursor = spawnMuzzleFlashFx(game.world, game.muzzleFlashCursor, shooter, shotAngle, weaponId)
    },
    onPlayerShoot: () => {
      game.sfx.shoot()
      updatePlayerWeaponSignals(game.world)
    },
    onPlayerBulletsFired: (count: number) => {
      game.world.playerBulletsFired += count
    },
    onOtherShoot: () => game.sfx.shoot(),
  }
}

export function firePrimaryForGame(game: FlowerArenaGame, unitId: string) {
  firePrimary(game.world, unitId, primaryFireDepsForGame(game))
}

export function swapPrimaryForGame(game: FlowerArenaGame, unitId: string, direction: number) {
  cyclePrimaryWeapon(unitId, game.world, direction, () => updatePlayerWeaponSignals(game.world))
}

export function throwSecondaryForGame(game: FlowerArenaGame, unitId: string) {
  throwSecondary(game.world, unitId, {
    allocThrowable: () => allocThrowable(game),
    onPlayerThrow: (mode) => {
      game.sfx.shoot()
      secondaryModeSignal.value = mode
    },
    onOtherThrow: () => game.sfx.shoot(),
  })
}

export function respawnUnitForGame(game: FlowerArenaGame, unitId: string) {
  respawnUnit(game.world, unitId, {
    equipPrimary: (id, weaponId, ammo) => equipPrimaryForGame(game, id, weaponId, ammo),
    randomLootablePrimary: () => game.randomLootablePrimaryForMatch(),
  })
}

export function applyDamageForGame(
  game: FlowerArenaGame,
  targetId: string,
  amount: number,
  sourceId: string,
  sourceTeam: Team,
  hitX: number,
  hitY: number,
  impactX: number,
  impactY: number,
  damageSource: DamageSource = "other",
) {
  applyDamage(game.world, targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, {
    allocPopup: () => allocPopup(game),
    spawnFlowers: (ownerId, x, y, dirX, dirY, amountValue, sizeScale, isBurnt, options) => {
      const scoreOwnerId = game.resolveScoreOwnerId(ownerId)
      spawnFlowers(
        game.world,
        ownerId,
        scoreOwnerId,
        x,
        y,
        dirX,
        dirY,
        amountValue,
        sizeScale,
        {
          allocFlower: () => allocFlower(game),
          playerId: game.playerCoverageId(),
          botPalette: (id) => botPalette(id),
          factionColor: (id) => game.world.factions.find((faction) => faction.id === id)?.color ?? null,
          onCoverageUpdated: () => updateCoverageSignals(game.world),
        },
        isBurnt,
        options,
      )
    },
    respawnUnit: (id) => respawnUnitForGame(game, id),
    onKillPetalBurst: (x, y) => game.spawnKillPetalBurst(x, y),
    onUnitKilled: (target, isSuicide, killer, killImpulse) => {
      game.spawnUnitRagdoll(target, killImpulse)

      if (isSuicide || !killer) {
        return
      }

      killer.matchKills += 1
      const spawnPerkDrop = killer.matchKills > 0 && killer.matchKills % 5 === 0
      if (spawnPerkDrop) {
        game.spawnPerkPickupDropAt(target.position.x, target.position.y, true)
        return
      }

      game.spawnLootPickupAt(target.position.x, target.position.y, true)
    },
    onSfxHit: (targetIsPlayer) => game.sfx.characterDamage(targetIsPlayer),
    onSfxDeath: () => game.sfx.die(),
    onSfxPlayerDeath: () => game.sfx.playerDeath(),
    onSfxPlayerKill: () => game.sfx.playerKill(),
    onPlayerHit: () => {
      game.world.playerBulletsHit += 1
      game.world.playerDamageDealt += amount
    },
    onPlayerKill: () => {
      game.world.playerKills += 1
    },
    onPlayerHpChanged: () => updatePlayerHpSignal(game.world),
    isInfiniteHpEnabled: () => debugInfiniteHpSignal.value,
  }, damageSource)
}
