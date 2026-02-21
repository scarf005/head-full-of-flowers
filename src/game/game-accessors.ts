import { buildCullBounds, type CullBounds, isInsideCullBounds } from "./cull.ts"
import { BURNED_FACTION_ID } from "./factions.ts"
import { equipPrimary } from "./systems/combat.ts"
import { setupWorldUnits } from "./systems/respawn.ts"
import { updatePlayerWeaponSignals } from "./adapters/hud-sync.ts"
import type { FlowerArenaGame } from "./game.ts"

type FogCullBounds = CullBounds

export function setupWorldForGame(game: FlowerArenaGame) {
  setupWorldUnits(
    game.world,
    (unitId, weaponId, ammo) =>
      equipPrimary(unitId, game.world, weaponId, ammo, () => updatePlayerWeaponSignals(game.world)),
  )
}

export function playerCoverageIdForGame(game: FlowerArenaGame) {
  return game.currentMode === "ffa" ? game.world.player.id : game.world.player.team
}

export function buildFogCullBoundsForGame(game: FlowerArenaGame, padding: number): FogCullBounds {
  return buildCullBounds(game.world.camera.x, game.world.camera.y, padding)
}

export function isInsideFogCullBoundsForGame(
  _game: FlowerArenaGame,
  x: number,
  y: number,
  bounds: FogCullBounds,
  padding: number,
) {
  return isInsideCullBounds(x, y, bounds, padding)
}

export function resolveScoreOwnerIdForGame(game: FlowerArenaGame, ownerId: string) {
  if (ownerId === BURNED_FACTION_ID || game.currentMode === "ffa") {
    return ownerId
  }

  const owner = game.world.unitById.get(ownerId)
  return owner?.team ?? ownerId
}
