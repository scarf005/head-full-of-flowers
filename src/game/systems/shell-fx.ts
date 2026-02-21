import { type CullBounds, isInsideCullBounds } from "../cull.ts"
import type { Unit } from "../entities.ts"
import {
  getWeaponSpriteHalfLength,
  getWeaponSpriteVariantId,
  scaleWeaponVariantToWeaponSize,
} from "../render/pixel-art.ts"
import { computeWeaponKickbackDistance } from "../render/unit-motion-transform.ts"
import { clamp, randomRange } from "../utils.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import type { PrimaryWeaponId } from "../types.ts"
import type { WorldState } from "../world/state.ts"

const MUZZLE_FLASH_BASE_RADIUS = 0.18
const MUZZLE_FLASH_REFERENCE_SPEED = 40
const MUZZLE_FLASH_MIN_RADIUS = 0.08

const allocShellCasing = (
  world: Pick<WorldState, "shellCasings">,
  cursor: number,
): {
  slot: WorldState["shellCasings"][number]
  nextCursor: number
} => {
  const pool = world.shellCasings
  const length = pool.length
  for (let index = 0; index < length; index += 1) {
    const candidateIndex = (cursor + index) % length
    const candidate = pool[candidateIndex]
    if (!candidate.active) {
      return {
        slot: candidate,
        nextCursor: (candidateIndex + 1) % length,
      }
    }
  }

  return {
    slot: pool[cursor],
    nextCursor: (cursor + 1) % length,
  }
}

const allocMuzzleFlash = (
  world: Pick<WorldState, "muzzleFlashes">,
  cursor: number,
): {
  slot: WorldState["muzzleFlashes"][number]
  nextCursor: number
} => {
  const pool = world.muzzleFlashes
  const length = pool.length
  for (let index = 0; index < length; index += 1) {
    const candidateIndex = (cursor + index) % length
    const candidate = pool[candidateIndex]
    if (!candidate.active) {
      return {
        slot: candidate,
        nextCursor: (candidateIndex + 1) % length,
      }
    }
  }

  return {
    slot: pool[cursor],
    nextCursor: (cursor + 1) % length,
  }
}

export const spawnShellCasingFx = (
  world: Pick<WorldState, "shellCasings">,
  cursor: number,
  unit: Unit,
): number => {
  if (
    unit.primaryWeapon === "flamethrower" ||
    unit.primaryWeapon === "grenade-launcher" ||
    unit.primaryWeapon === "rocket-launcher"
  ) {
    return cursor
  }

  const { slot, nextCursor } = allocShellCasing(world, cursor)
  const aimAngle = Math.atan2(unit.aim.y, unit.aim.x)
  const side = Math.random() > 0.5 ? 1 : -1
  const angle = aimAngle + side * Math.PI * 0.5 + randomRange(-0.4, 0.4)
  const baseSpeed = unit.primaryWeapon === "shotgun" ? 7.6 : unit.primaryWeapon === "assault" ? 6.4 : 5.2
  slot.active = true
  slot.position.set(
    unit.position.x - unit.aim.x * 0.12 + randomRange(-0.07, 0.07),
    unit.position.y - unit.aim.y * 0.12 + randomRange(-0.07, 0.07),
  )
  slot.velocity.set(Math.cos(angle) * baseSpeed, Math.sin(angle) * baseSpeed)
  slot.rotation = randomRange(0, Math.PI * 2)
  slot.angularVelocity = randomRange(-12, 12)
  slot.size = randomRange(0.048, 0.084)
  slot.maxLife = randomRange(0.55, 1.1)
  slot.life = slot.maxLife
  slot.bounceCount = 0
  slot.spriteId = null
  slot.spriteSize = 0

  return nextCursor
}

export const spawnDroppedMagazineFx = (
  world: Pick<WorldState, "shellCasings">,
  cursor: number,
  unit: Unit,
  weaponId: PrimaryWeaponId = unit.primaryWeapon,
): number => {
  const magazineSpriteId = getWeaponSpriteVariantId(weaponId, "magazine")
  if (!magazineSpriteId) {
    return cursor
  }

  const weaponZoom = Math.max(0.1, unit.radius * 0.36) * 1.5
  const magazineZoom = scaleWeaponVariantToWeaponSize(weaponId, "magazine", weaponZoom)
  if (magazineZoom === null) {
    return cursor
  }

  const { slot, nextCursor } = allocShellCasing(world, cursor)
  const aimAngle = Math.atan2(unit.aim.y, unit.aim.x)
  const side = Math.random() > 0.5 ? 1 : -1
  const angle = aimAngle + Math.PI + side * randomRange(0.16, 0.34) + randomRange(-0.14, 0.14)
  slot.active = true
  slot.position.set(
    unit.position.x - unit.aim.x * 0.14 + randomRange(-0.08, 0.08),
    unit.position.y - unit.aim.y * 0.14 + randomRange(-0.08, 0.08),
  )
  slot.velocity.set(Math.cos(angle) * randomRange(3.8, 5.6), Math.sin(angle) * randomRange(3.8, 5.6))
  slot.rotation = randomRange(0, Math.PI * 2)
  slot.angularVelocity = randomRange(-9, 9)
  slot.size = randomRange(0.17, 0.24)
  slot.maxLife = randomRange(0.72, 1.35)
  slot.life = slot.maxLife
  slot.bounceCount = 0
  slot.spriteId = magazineSpriteId
  slot.spriteSize = magazineZoom

  return nextCursor
}

export const spawnMuzzleFlashFx = (
  world: Pick<WorldState, "muzzleFlashes">,
  cursor: number,
  unit: Unit,
  shotAngle: number,
  weaponId: PrimaryWeaponId,
): number => {
  const weapon = PRIMARY_WEAPONS[weaponId]
  const aimLength = Math.hypot(unit.aim.x, unit.aim.y)
  if (aimLength <= 0.0001) {
    return cursor
  }

  const aimX = unit.aim.x / aimLength
  const aimY = unit.aim.y / aimLength
  const dirX = Math.cos(shotAngle)
  const dirY = Math.sin(shotAngle)
  const drawX = unit.position.x - aimX * unit.recoil * 0.32
  const drawY = unit.position.y - aimY * unit.recoil * 0.32
  const weaponKickback = computeWeaponKickbackDistance(unit.recoil, weapon.firingKnockback, unit.radius)
  const gunLength = Math.max(unit.radius * 0.42, unit.radius * 1.25 - weaponKickback)
  const weaponScale = Math.max(0.1, unit.radius * 0.36) * 1.5
  const muzzleOffset = gunLength + getWeaponSpriteHalfLength(weaponId, weaponScale)
  const muzzleX = drawX + dirX * muzzleOffset
  const muzzleY = drawY + dirY * muzzleOffset

  const { slot, nextCursor } = allocMuzzleFlash(world, cursor)
  const speedScale = Number.isFinite(weapon.speed) && weapon.speed > 0 ? weapon.speed / MUZZLE_FLASH_REFERENCE_SPEED : 1
  slot.active = true
  slot.position.set(muzzleX, muzzleY)
  slot.radius = Math.max(MUZZLE_FLASH_MIN_RADIUS, MUZZLE_FLASH_BASE_RADIUS * speedScale)

  return nextCursor
}

export const updateShellCasingsFx = (
  world: Pick<WorldState, "shellCasings" | "arenaRadius">,
  dt: number,
  fogCullBounds?: CullBounds,
) => {
  const drag = clamp(1 - dt * 4.8, 0, 1)
  for (const casing of world.shellCasings) {
    if (!casing.active) {
      continue
    }

    if (
      fogCullBounds &&
      !isInsideCullBounds(casing.position.x, casing.position.y, fogCullBounds, casing.size + 0.3)
    ) {
      casing.active = false
      continue
    }

    casing.life -= dt
    if (casing.life <= 0) {
      casing.active = false
      continue
    }

    casing.velocity.x *= drag
    casing.velocity.y *= drag
    casing.position.x += casing.velocity.x * dt
    casing.position.y += casing.velocity.y * dt
    casing.rotation += casing.angularVelocity * dt
    casing.angularVelocity *= drag

    const distance = Math.hypot(casing.position.x, casing.position.y) || 1
    const maxDistance = world.arenaRadius - casing.size * 0.5
    if (distance > maxDistance && casing.bounceCount < 3) {
      const normalX = casing.position.x / distance
      const normalY = casing.position.y / distance
      casing.position.x = normalX * maxDistance
      casing.position.y = normalY * maxDistance
      const reflected = casing.velocity.x * normalX + casing.velocity.y * normalY
      casing.velocity.x -= normalX * reflected * 1.8
      casing.velocity.y -= normalY * reflected * 1.8
      casing.velocity.x *= 0.52
      casing.velocity.y *= 0.52
      casing.bounceCount += 1
    }
  }
}
