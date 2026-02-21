import type { Team } from "../types.ts"
import { randomRange } from "../utils.ts"
import type { Unit } from "../entities.ts"
import { BURNED_FACTION_ID } from "../factions.ts"
import { randomFlowerBurst } from "./flowers.ts"
import { rebuildUnitLookup, type WorldState } from "../world/state.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"

const DEATH_FLOWER_AMOUNT_MULTIPLIER = 2
const DEATH_FLOWER_SIZE_SCALE_BOOST = 0.25
const KILL_CIRCLE_EXTRA_BURSTS = 3
const KILL_CIRCLE_EXTRA_AMOUNT_MULTIPLIER = 0.85
const KILL_CIRCLE_RADIUS_MIN = 0.2
const KILL_CIRCLE_RADIUS_MAX = 0.95
const KILL_HP_BONUS = 3
const PLAYER_KILL_SCREEN_SHAKE_MULTIPLIER = 5
const OFFSCREEN_NON_PLAYER_SCREEN_SHAKE_MULTIPLIER = 0.5

const isWorldPointInView = (world: WorldState, x: number, y: number) => {
  const halfWidth = VIEW_WIDTH * 0.5 / WORLD_SCALE
  const halfHeight = VIEW_HEIGHT * 0.5 / WORLD_SCALE
  return x >= world.camera.x - halfWidth &&
    x <= world.camera.x + halfWidth &&
    y >= world.camera.y - halfHeight &&
    y <= world.camera.y + halfHeight
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
  onUnitKilled?: (
    target: Unit,
    isSuicide: boolean,
    killer: Unit | null,
    killImpulse: {
      hitX: number
      hitY: number
      impactX: number
      impactY: number
      damage: number
      damageSource: DamageSource
    },
  ) => void
  onSfxHit: (isPlayerInvolved: boolean) => void
  onSfxDeath: () => void
  onSfxPlayerDeath: () => void
  onSfxPlayerKill: () => void
  onPlayerHit?: (targetId: string, damage: number) => void
  onPlayerKill?: (targetId: string) => void
  onPlayerHpChanged: () => void
  isInfiniteHpEnabled?: () => boolean
}

export type DamageSource = "projectile" | "throwable" | "molotov" | "arena" | "other"

interface ApplyDamageRuntimeDeps extends DamageDeps {
  completeReload: (unit: Unit, allowInProgress: boolean) => boolean
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
    if (unit.team !== team || unit.id === excludedUnitId || unit.hp <= 0) {
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
  deps: ApplyDamageRuntimeDeps,
  damageSource: DamageSource = "other",
) => {
  if (world.unitById.size !== world.units.length) {
    rebuildUnitLookup(world)
  }
  for (const unit of world.units) {
    if (world.unitById.get(unit.id) !== unit) {
      rebuildUnitLookup(world)
      break
    }
  }

  const target = world.unitById.get(targetId)
  if (!target) {
    return
  }

  const impactFeel = Math.max(1, Math.min(2, world.impactFeelLevel || 1))
  const shakeScale = 1 + (impactFeel - 1) * 2
  const hitStopScale = 1 + (impactFeel - 1) * 2
  const shakeCapBoost = (impactFeel - 1) * 1.5

  const sourceUnit = world.unitById.get(sourceId)
  const isSelfHarm = !!sourceUnit && sourceUnit.id === target.id
  const isBoundarySource = sourceId === "arena"
  const isSelfInflictedExplosive = isSelfHarm &&
    (damageSource === "projectile" || damageSource === "throwable" || damageSource === "molotov")
  const isSelfInflictedBlast = isSelfHarm && (damageSource === "projectile" || damageSource === "throwable")
  const resolvedSourceTeam = sourceUnit?.team ?? sourceTeam

  if (!isBoundarySource && !isSelfHarm && resolvedSourceTeam === target.team) {
    return
  }

  const reducedAmount = Math.max(0, amount - target.damageReductionFlat)
  const baseDamage = Math.max(1, reducedAmount * Math.max(0.1, target.damageTakenMultiplier))
  const damage = isSelfInflictedBlast ? Math.max(target.hp, baseDamage) : baseDamage
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

  const impactLength = Math.hypot(impactX, impactY)
  const impactLengthSafe = impactLength || 1
  const hitSpeed = impactLength
  const isPlayerSource = sourceId === world.player.id || sourceId === world.player.team || sourceUnit?.isPlayer === true
  const sourceByNearestTeam = sourceUnit?.id ??
    (!isBoundarySource && resolvedSourceTeam
      ? nearestUnitIdByTeam(world, resolvedSourceTeam, hitX, hitY, target.id)
      : "")
  let normalizedSourceId = isPlayerSource ? world.player.id : sourceByNearestTeam || sourceId

  const sourceIdIsUnit = sourceId.length > 0 ? world.unitById.has(sourceId) : false
  const normalizedSourceIdIsUnit = normalizedSourceId.length > 0 ? world.unitById.has(normalizedSourceId) : false

  if (!isPlayerSource && !isBoundarySource && !sourceIdIsUnit && !normalizedSourceIdIsUnit) {
    const fallbackId = resolvedSourceTeam === world.player.team
      ? world.player.hp > 0 ? world.player.id : ""
      : world.units.find((unit) => unit.team === resolvedSourceTeam && !unit.isPlayer && unit.hp > 0)?.id

    if (fallbackId) {
      normalizedSourceId = fallbackId
    }
  }

  const flowerSourceId = isSelfHarm || isBoundarySource ? BURNED_FACTION_ID : normalizedSourceId
  const isBurntFlowers = isSelfInflictedExplosive
  const isKilled = target.hp <= 0
  const staggeredBloom = isPlayerSource && target.id !== world.player.id && damageSource === "projectile"

  const killer: Unit | null = !isSelfHarm && !isBoundarySource
    ? sourceUnit ?? world.unitById.get(normalizedSourceId) ?? null
    : null

  if (isKilled) {
    if (killer) {
      killer.hp = Math.min(killer.maxHp, killer.hp + KILL_HP_BONUS)
      if ((killer.perkStacks.kill_reload ?? 0) > 0) {
        killer.nextReloadTimeMultiplier = Math.min(killer.nextReloadTimeMultiplier, 0.5)
      }

      const bonusPopup = deps.allocPopup()
      bonusPopup.active = true
      bonusPopup.position.set(
        killer.position.x + randomRange(-0.22, 0.22),
        killer.position.y - randomRange(0.85, 1.2),
      )
      bonusPopup.velocity.set(randomRange(-0.55, 0.55), randomRange(2.2, 3.2))
      bonusPopup.text = `+${KILL_HP_BONUS} HP`
      bonusPopup.color = "#a9ffbb"
      bonusPopup.life = 0.72
    }

    const deathBurst = randomFlowerBurst(damage, hitSpeed)
    let deathDirX = impactX
    let deathDirY = impactY
    if (deathDirX * deathDirX + deathDirY * deathDirY <= 0.00000001) {
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

  if (target.isPlayer && deps.isInfiniteHpEnabled?.()) {
    target.hp = target.maxHp
  }

  if (isPlayerSource && target.id !== world.player.id) {
    deps.onPlayerHit?.(target.id, damage)
  }

  if (isPlayerSource && target.id !== world.player.id) {
    const killShakeScale = isKilled ? PLAYER_KILL_SCREEN_SHAKE_MULTIPLIER : 1
    world.cameraShake = Math.min(
      2.8 + shakeCapBoost,
      world.cameraShake + 0.48 * shakeScale * killShakeScale,
    )
    world.hitStop = Math.max(world.hitStop, 0.012 * hitStopScale)
  }

  if (target.isPlayer) {
    world.cameraShake = Math.min(3 + shakeCapBoost, world.cameraShake + 0.66 * shakeScale)
    world.hitStop = Math.max(world.hitStop, 0.016 * hitStopScale)
  }

  const impactDirX = impactX / impactLengthSafe
  const impactDirY = impactY / impactLengthSafe
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

  const kickCap = 0.3 + (impactFeel - 1) * 0.7
  const kickLengthSquared = world.cameraKick.x * world.cameraKick.x + world.cameraKick.y * world.cameraKick.y
  if (kickLengthSquared > kickCap * kickCap) {
    const kickLength = Math.sqrt(kickLengthSquared)
    const scale = kickCap / kickLength
    world.cameraKick.x *= scale
    world.cameraKick.y *= scale
  }

  if (!isPlayerSource || target.id === world.player.id || !isKilled) {
    const nonPlayerOffscreenShakeScale = !isPlayerSource &&
        target.id !== world.player.id &&
        !isWorldPointInView(world, hitX, hitY)
      ? OFFSCREEN_NON_PLAYER_SCREEN_SHAKE_MULTIPLIER
      : 1
    world.cameraShake = Math.min(
      1.15 + shakeCapBoost,
      world.cameraShake + 0.09 * shakeScale * nonPlayerOffscreenShakeScale,
    )
  }

  if (isKilled) {
    deps.completeReload(target, true)
    deps.onUnitKilled?.(target, isSelfHarm, killer, {
      hitX,
      hitY,
      impactX,
      impactY,
      damage,
      damageSource,
    })
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

  if (isKilled && killer?.isPlayer) {
    deps.onPlayerHpChanged()
  }
}
