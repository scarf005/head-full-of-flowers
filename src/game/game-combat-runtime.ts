import { botPalette } from "./factions.ts"
import { Flower } from "./entities.ts"
import { debugInfiniteHpSignal, secondaryModeSignal } from "./signals.ts"
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
import type { FlowerArenaGame } from "./game.ts"

const FLOWER_SPAWN_BUDGET_PER_FRAME = 32

type FlowerSpawnOptions = Parameters<typeof spawnFlowers>[11]

interface PendingFlowerSpawn {
  generationToken: number
  ownerId: string
  scoreOwnerId: string
  x: number
  y: number
  dirX: number
  dirY: number
  amountRemaining: number
  sizeScale: number
  fromPlayer: boolean
  isBurnt: boolean
  options: FlowerSpawnOptions
}

const pendingFlowerSpawns = new WeakMap<FlowerArenaGame, PendingFlowerSpawn[]>()

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
  const world = game.world
  const flowers = world.flowers
  if (flowers.length === 0) {
    const spawned = new Flower()
    spawned.slotIndex = 0
    flowers.push(spawned)
  }

  const index = world.flowerCursor % flowers.length
  const slot = flowers[index]
  if (slot.active) {
    const cellIndex = slot.bloomCell
    const previous = slot.prevInCell
    const next = slot.nextInCell
    if (cellIndex >= 0 && cellIndex < world.flowerCellHead.length) {
      if (previous >= 0 && previous < flowers.length) {
        flowers[previous].nextInCell = next
      } else {
        world.flowerCellHead[cellIndex] = next
      }
      if (next >= 0 && next < flowers.length) {
        flowers[next].prevInCell = previous
      }
    }

    world.flowerBloomingIndices.delete(index)
    world.flowerDirtyIndices.delete(index)
    world.flowerDirtyCount = world.flowerDirtyIndices.size
    slot.active = false
    slot.renderDirty = false
    slot.bloomCell = -1
    slot.prevInCell = -1
    slot.nextInCell = -1
  }
  if (slot.slotIndex !== index) {
    slot.slotIndex = index
  }
  world.flowerCursor = (index + 1) % flowers.length
  return slot
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

const primaryFireDepsCache = new WeakMap<FlowerArenaGame, FirePrimaryDeps>()

export function primaryFireDepsForGame(game: FlowerArenaGame): FirePrimaryDeps {
  const cached = primaryFireDepsCache.get(game)
  if (cached) {
    return cached
  }

  const deps: FirePrimaryDeps = {
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
    onPlayerShoot: (weaponId, startsBurst) => {
      game.sfx.shoot(weaponId)
      if (startsBurst) {
        updatePlayerWeaponSignals(game.world)
      }
    },
    onPlayerBulletsFired: (count: number) => {
      game.world.playerBulletsFired += count
    },
    onOtherShoot: (weaponId, _startsBurst, distanceToPlayerMeters) => game.sfx.shoot(weaponId, distanceToPlayerMeters),
  }
  primaryFireDepsCache.set(game, deps)
  return deps
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

const flowerSpawnDepsCache = new WeakMap<FlowerArenaGame, Parameters<typeof spawnFlowers>[9]>()

const flowerSpawnDepsForGame = (game: FlowerArenaGame): Parameters<typeof spawnFlowers>[9] => {
  const cached = flowerSpawnDepsCache.get(game)
  if (cached) {
    return cached
  }

  const deps: Parameters<typeof spawnFlowers>[9] = {
    allocFlower: () => allocFlower(game),
    playerId: game.playerCoverageId(),
    botPalette: (id) => botPalette(id),
    factionColor: (id) => game.world.factions.find((faction) => faction.id === id)?.color ?? null,
    onCoverageUpdated: () => {},
  }
  flowerSpawnDepsCache.set(game, deps)
  return deps
}

const queueFlowerSpawnForGame = (
  game: FlowerArenaGame,
  ownerId: string,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  amount: number,
  sizeScale: number,
  isBurnt = false,
  options: FlowerSpawnOptions = {},
) => {
  const amountRemaining = Math.max(0, Math.floor(amount))
  if (amountRemaining <= 0) {
    return
  }

  const scoreOwnerId = game.resolveScoreOwnerId(ownerId)
  const playerCoverageId = game.playerCoverageId()
  const fromPlayer = scoreOwnerId === playerCoverageId
  if (scoreOwnerId in game.world.factionFlowerCounts) {
    game.world.factionFlowerCounts[scoreOwnerId] += amountRemaining
  }
  if (fromPlayer) {
    game.world.playerFlowerTotal += amountRemaining
  }

  let queue = pendingFlowerSpawns.get(game)
  if (!queue) {
    queue = []
    pendingFlowerSpawns.set(game, queue)
  }
  queue.push({
    generationToken: game.beginMatchGenerationToken,
    ownerId,
    scoreOwnerId,
    x,
    y,
    dirX,
    dirY,
    amountRemaining,
    sizeScale,
    fromPlayer,
    isBurnt,
    options,
  })
}

export function drainFlowerSpawnsForGame(game: FlowerArenaGame) {
  const queue = pendingFlowerSpawns.get(game)
  if (!queue || queue.length <= 0) {
    return
  }

  let remainingBudget = FLOWER_SPAWN_BUDGET_PER_FRAME
  let didSpawn = false
  const spawnDeps = flowerSpawnDepsForGame(game)
  spawnDeps.playerId = game.playerCoverageId()

  while (remainingBudget > 0 && queue.length > 0) {
    const pending = queue[0]
    if (pending.generationToken !== game.beginMatchGenerationToken) {
      queue.shift()
      continue
    }

    const amount = Math.min(remainingBudget, pending.amountRemaining)
    spawnFlowers(
      game.world,
      pending.ownerId,
      pending.scoreOwnerId,
      pending.x,
      pending.y,
      pending.dirX,
      pending.dirY,
      amount,
      pending.sizeScale,
      spawnDeps,
      pending.isBurnt,
      pending.options,
    )
    if (pending.scoreOwnerId in game.world.factionFlowerCounts) {
      game.world.factionFlowerCounts[pending.scoreOwnerId] = Math.max(
        0,
        game.world.factionFlowerCounts[pending.scoreOwnerId] - amount,
      )
    }
    if (pending.fromPlayer) {
      game.world.playerFlowerTotal = Math.max(0, game.world.playerFlowerTotal - amount)
    }
    didSpawn = true
    pending.amountRemaining -= amount
    remainingBudget -= amount
    if (pending.amountRemaining <= 0) {
      queue.shift()
    }
  }

  if (didSpawn) {
    updateCoverageSignals(game.world)
  }
  if (queue.length <= 0) {
    pendingFlowerSpawns.delete(game)
  }
}

const damageDepsCache = new WeakMap<FlowerArenaGame, Parameters<typeof applyDamage>[9]>()

const damageDepsForGame = (game: FlowerArenaGame): Parameters<typeof applyDamage>[9] => {
  const cached = damageDepsCache.get(game)
  if (cached) {
    return cached
  }

  const deps: Parameters<typeof applyDamage>[9] = {
    allocPopup: () => allocPopup(game),
    spawnFlowers: (ownerId, x, y, dirX, dirY, amountValue, sizeScale, isBurnt, options) => {
      queueFlowerSpawnForGame(game, ownerId, x, y, dirX, dirY, amountValue, sizeScale, isBurnt, options)
    },
    respawnUnit: (id) => respawnUnitForGame(game, id),
    onKillPetalBurst: (x, y) => game.spawnKillPetalBurst(x, y),
    onUnitKilled: (target, isSuicide, killer, killImpulse) => {
      game.spawnUnitRagdoll(target, killImpulse)

      if (target.isPlayer) {
        game.world.playerDeaths += 1
      }

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
    onPlayerHit: (_targetId, damageAmount) => {
      game.world.playerBulletsHit += 1
      game.world.playerDamageDealt += damageAmount
    },
    onPlayerKill: () => {
      game.world.playerKills += 1
    },
    onPlayerHpChanged: () => updatePlayerHpSignal(game.world),
    isInfiniteHpEnabled: () =>
      game.world.replayPlaybackActive ? game.replayDebugOptions.infiniteHp : debugInfiniteHpSignal.value,
  }

  damageDepsCache.set(game, deps)
  return deps
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
  applyDamage(
    game.world,
    targetId,
    amount,
    sourceId,
    sourceTeam,
    hitX,
    hitY,
    impactX,
    impactY,
    damageDepsForGame(game),
    damageSource,
  )
}
