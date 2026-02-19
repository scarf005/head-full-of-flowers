import { clamp, lerp, limitToArena, randomRange } from "../utils.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import {
  isObstacleCellSolid,
  obstacleArmorForMaterial,
  obstacleGridIndex,
  obstacleGridToWorldCenter,
  worldToObstacleGrid,
} from "../world/obstacle-grid.ts"
import type { WorldState } from "../world/state.ts"

const parseBotIndex = (botId: string) => {
  const parsed = Number(botId.replace("bot-", ""))
  return Number.isFinite(parsed) ? parsed : 0
}

const updateBotAim = (
  bot: WorldState["bots"][number],
  botIndex: number,
  toTargetX: number,
  toTargetY: number,
  distanceToTarget: number,
  dt: number,
  nowMs: number,
  panic = 0,
) => {
  const baseAngle = Math.atan2(toTargetY, toTargetX)
  const farBias = clamp((distanceToTarget - 8) / 24, 0, 1)
  const movementFactor = clamp(bot.velocity.length() / (bot.speed || 1), 0, 1)
  const sway =
    Math.sin(nowMs * 0.006 + botIndex * 1.91) * (0.02 + farBias * 0.1 + movementFactor * 0.035 + panic * 0.05) +
    Math.cos(nowMs * 0.003 + botIndex * 0.67) * (0.015 + farBias * 0.07 + panic * 0.02)
  const targetAngle = baseAngle + sway
  const trackRate = clamp(dt * (11 - farBias * 6 - panic * 1.6), 0.1, 0.95)

  bot.aim.x = lerp(bot.aim.x, Math.cos(targetAngle), trackRate)
  bot.aim.y = lerp(bot.aim.y, Math.sin(targetAngle), trackRate)
  const aimLength = Math.hypot(bot.aim.x, bot.aim.y) || 1
  bot.aim.x /= aimLength
  bot.aim.y /= aimLength
}

const findNearestTarget = (
  world: WorldState,
  originId: string,
  originTeam: string,
  x: number,
  y: number,
  maxDistance = Number.POSITIVE_INFINITY,
) => {
  let targetId = ""
  let bestDistance = maxDistance
  let deltaX = 0
  let deltaY = 0

  for (const candidate of world.units) {
    if (candidate.id === originId || candidate.hp <= 0 || candidate.team === originTeam) {
      continue
    }

    const dx = candidate.position.x - x
    const dy = candidate.position.y - y
    const distance = Math.hypot(dx, dy)
    if (distance >= bestDistance) {
      continue
    }

    targetId = candidate.id
    bestDistance = distance
    deltaX = dx
    deltaY = dy
  }

  return {
    targetId,
    distance: bestDistance,
    deltaX,
    deltaY,
  }
}

const sampleBlockingObstacleCell = (
  world: WorldState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) => {
  const dx = toX - fromX
  const dy = toY - fromY
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 4))
  const grid = world.obstacleGrid

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps
    const sampleX = lerp(fromX, toX, t)
    const sampleY = lerp(fromY, toY, t)
    const cell = worldToObstacleGrid(grid.size, sampleX, sampleY)
    if (!isObstacleCellSolid(grid, cell.x, cell.y)) {
      continue
    }

    return cell
  }

  return null
}

const assessShotBlocker = (
  world: WorldState,
  bot: WorldState["bots"][number],
  toTargetX: number,
  toTargetY: number,
  distanceToTarget: number,
) => {
  if (distanceToTarget <= 0 || !Number.isFinite(distanceToTarget)) {
    return null
  }

  const targetX = bot.position.x + toTargetX
  const targetY = bot.position.y + toTargetY
  const blocker = sampleBlockingObstacleCell(world, bot.position.x, bot.position.y, targetX, targetY)
  if (!blocker) {
    return null
  }

  const weapon = PRIMARY_WEAPONS[bot.primaryWeapon]
  const index = obstacleGridIndex(world.obstacleGrid.size, blocker.x, blocker.y)
  const obstacleMaterial = world.obstacleGrid.material[index]
  const obstacleArmor = obstacleArmorForMaterial(obstacleMaterial)
  const canBypassWithExplosive = weapon.projectileKind === "grenade" || weapon.projectileKind === "rocket"
  const weaponDamage = Math.max(1, weapon.damage * bot.damageMultiplier + bot.projectileDamageBonus)
  const obstacleCenter = obstacleGridToWorldCenter(world.obstacleGrid.size, blocker.x, blocker.y)

  return {
    canDamageWithPrimary: canBypassWithExplosive || weaponDamage > obstacleArmor,
    obstacleCenter,
  }
}

const isPositionNavigable = (world: WorldState, x: number, y: number, radius: number) => {
  const maxArenaDistance = world.arenaRadius - radius
  if (Math.hypot(x, y) > maxArenaDistance) {
    return false
  }

  const grid = world.obstacleGrid
  const min = worldToObstacleGrid(grid.size, x - radius, y - radius)
  const max = worldToObstacleGrid(grid.size, x + radius, y + radius)
  const minX = Math.max(0, min.x)
  const maxX = Math.min(grid.size - 1, max.x)
  const minY = Math.max(0, min.y)
  const maxY = Math.min(grid.size - 1, max.y)

  for (let gy = minY; gy <= maxY; gy += 1) {
    for (let gx = minX; gx <= maxX; gx += 1) {
      if (!isObstacleCellSolid(grid, gx, gy)) {
        continue
      }

      const cellCenter = obstacleGridToWorldCenter(grid.size, gx, gy)
      const nearestX = clamp(x, cellCenter.x - 0.5, cellCenter.x + 0.5)
      const nearestY = clamp(y, cellCenter.y - 0.5, cellCenter.y + 0.5)
      const dx = x - nearestX
      const dy = y - nearestY
      if (dx * dx + dy * dy <= radius * radius) {
        return false
      }
    }
  }

  return true
}

const clearanceAlongDirection = (
  world: WorldState,
  bot: WorldState["bots"][number],
  dirX: number,
  dirY: number,
  maxDistance: number,
) => {
  const dirLength = Math.hypot(dirX, dirY)
  if (dirLength <= 0.0001) {
    return 0
  }

  const nx = dirX / dirLength
  const ny = dirY / dirLength
  const step = 0.2
  let lastClear = 0

  for (let distance = step; distance <= maxDistance; distance += step) {
    const sampleX = bot.position.x + nx * distance
    const sampleY = bot.position.y + ny * distance
    if (!isPositionNavigable(world, sampleX, sampleY, bot.radius)) {
      return lastClear
    }

    lastClear = distance
  }

  return lastClear
}

const findNearestSolidCellAround = (world: WorldState, x: number, y: number, searchRadius = 2.4) => {
  const grid = world.obstacleGrid
  const center = worldToObstacleGrid(grid.size, x, y)
  const maxCellOffset = Math.max(1, Math.ceil(searchRadius + 1))
  let best: { x: number; y: number; distance: number } | null = null

  for (let offsetY = -maxCellOffset; offsetY <= maxCellOffset; offsetY += 1) {
    for (let offsetX = -maxCellOffset; offsetX <= maxCellOffset; offsetX += 1) {
      const gx = center.x + offsetX
      const gy = center.y + offsetY
      if (gx < 0 || gy < 0 || gx >= grid.size || gy >= grid.size || !isObstacleCellSolid(grid, gx, gy)) {
        continue
      }

      const worldCenter = obstacleGridToWorldCenter(grid.size, gx, gy)
      const distance = Math.hypot(worldCenter.x - x, worldCenter.y - y)
      if (distance > searchRadius) {
        continue
      }

      if (!best || distance < best.distance) {
        best = {
          x: worldCenter.x,
          y: worldCenter.y,
          distance,
        }
      }
    }
  }

  return best
}

const findEscapeDirection = (
  world: WorldState,
  bot: WorldState["bots"][number],
  toTargetX: number,
  toTargetY: number,
  nearArenaEdge: boolean,
  shotBlocker: ReturnType<typeof assessShotBlocker>,
) => {
  const distanceToTarget = Math.hypot(toTargetX, toTargetY) || 1
  const centerDistance = Math.hypot(bot.position.x, bot.position.y) || 1
  const centerPullX = -bot.position.x / centerDistance
  const centerPullY = -bot.position.y / centerDistance
  const obstaclePoint = shotBlocker?.obstacleCenter ?? findNearestSolidCellAround(world, bot.position.x, bot.position.y)
  const awayObstacleX = obstaclePoint ? bot.position.x - obstaclePoint.x : centerPullX
  const awayObstacleY = obstaclePoint ? bot.position.y - obstaclePoint.y : centerPullY

  const candidateDirections: Array<{ x: number; y: number }> = [
    { x: centerPullX, y: centerPullY },
    { x: awayObstacleX, y: awayObstacleY },
    { x: -toTargetY, y: toTargetX },
    { x: toTargetY, y: -toTargetX },
    { x: bot.aiMove.x, y: bot.aiMove.y },
    { x: -toTargetX, y: -toTargetY },
  ]

  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2
    candidateDirections.push({ x: Math.cos(angle), y: Math.sin(angle) })
  }

  let best: { x: number; y: number; clearance: number } | null = null
  for (const candidate of candidateDirections) {
    const candidateLength = Math.hypot(candidate.x, candidate.y)
    if (candidateLength <= 0.0001) {
      continue
    }

    const directionX = candidate.x / candidateLength
    const directionY = candidate.y / candidateLength
    const clearance = clearanceAlongDirection(world, bot, directionX, directionY, 2.2)
    const centerScore = directionX * centerPullX + directionY * centerPullY
    const awayObstacleLength = Math.hypot(awayObstacleX, awayObstacleY) || 1
    const awayObstacleScore = directionX * (awayObstacleX / awayObstacleLength) +
      directionY * (awayObstacleY / awayObstacleLength)
    const lateralScore = Math.abs(
      directionX * (-toTargetY / distanceToTarget) + directionY * (toTargetX / distanceToTarget),
    )
    const totalScore = clearance * 1.8 + centerScore * (nearArenaEdge ? 1.2 : 0.5) + awayObstacleScore * 0.9 +
      lateralScore * 0.3

    if (!best || totalScore > best.clearance) {
      best = {
        x: directionX,
        y: directionY,
        clearance: totalScore,
      }
    }
  }

  if (!best) {
    return {
      dirX: centerPullX,
      dirY: centerPullY,
      blocked: true,
    }
  }

  const escapeClearance = clearanceAlongDirection(world, bot, best.x, best.y, 1.2)
  return {
    dirX: best.x,
    dirY: best.y,
    blocked: escapeClearance < 0.25,
  }
}

export interface UpdateAIDeps {
  firePrimary: (botId: string) => void
  continueBurst: (botId: string) => void
  throwSecondary: (botId: string) => void
  finishReload: (botId: string) => void
  collectNearbyPickup: (botId: string) => void
  nowMs: () => number
}

export const updateAI = (world: WorldState, dt: number, deps: UpdateAIDeps) => {
  const nowMs = deps.nowMs()
  const easyMode = world.aiDifficulty === "easy"
  for (const bot of world.bots) {
    const botIndex = parseBotIndex(bot.id)
    bot.shootCooldown = Math.max(0, bot.shootCooldown - dt)
    bot.secondaryCooldown = Math.max(0, bot.secondaryCooldown - dt)
    if (bot.secondaryCooldown <= 0) {
      bot.secondaryCooldownMax = 0
    }
    bot.reloadCooldown = Math.max(0, bot.reloadCooldown - dt)
    deps.continueBurst(bot.id)
    if (bot.reloadCooldown <= 0) {
      deps.finishReload(bot.id)
    }
    bot.aiDecisionTimer -= dt
    let desiredVelocityX = bot.velocity.x
    let desiredVelocityY = bot.velocity.y

    const nearestTarget = findNearestTarget(world, bot.id, bot.team, bot.position.x, bot.position.y, 36)
    const hasTarget = nearestTarget.targetId !== ""
    const distanceToTarget = nearestTarget.distance
    const toTargetX = nearestTarget.deltaX
    const toTargetY = nearestTarget.deltaY
    const shotBlocker = !easyMode && hasTarget
      ? assessShotBlocker(world, bot, toTargetX, toTargetY, distanceToTarget)
      : null
    const blockedByIndestructibleCover = shotBlocker !== null && !shotBlocker.canDamageWithPrimary
    const distanceFromArenaCenter = Math.hypot(bot.position.x, bot.position.y) || 1
    const nearArenaEdge = distanceFromArenaCenter > world.arenaRadius - Math.max(3.5, bot.radius * 0.4)

    if (bot.hp <= bot.maxHp * 0.32) {
      bot.aiState = "flee"
    } else if (hasTarget && distanceToTarget < (easyMode ? 14 : 24)) {
      bot.aiState = "aggro"
    } else {
      bot.aiState = "wander"
    }

    if (bot.aiDecisionTimer <= 0) {
      bot.aiDecisionTimer = easyMode ? randomRange(1.4, 3) : randomRange(0.4, 1.4)
      const angle = randomRange(0, Math.PI * 2)
      bot.aiMove.x = Math.cos(angle)
      bot.aiMove.y = Math.sin(angle)
    }

    if (bot.aiState === "wander") {
      const wanderSpeed = easyMode ? 0.46 : 0.7
      desiredVelocityX = bot.aiMove.x * bot.speed * wanderSpeed
      desiredVelocityY = bot.aiMove.y * bot.speed * wanderSpeed
    }

    if (bot.aiState === "aggro") {
      if (!hasTarget) {
        bot.aiState = "wander"
        continue
      }

      const distanceSafe = distanceToTarget || 1
      const towardX = toTargetX / distanceSafe
      const towardY = toTargetY / distanceSafe
      const strafe = Math.sin(nowMs * 0.001 + botIndex)
      const strafeScale = easyMode ? 0.14 : 0.45
      const pursuitSpeed = easyMode ? 0.68 : 1
      desiredVelocityX = (towardX + -towardY * strafe * strafeScale) * bot.speed * pursuitSpeed
      desiredVelocityY = (towardY + towardX * strafe * strafeScale) * bot.speed * pursuitSpeed

      if (easyMode && bot.aiDecisionTimer > 1.1) {
        desiredVelocityX = towardX * bot.speed * 0.42
        desiredVelocityY = towardY * bot.speed * 0.42
      } else {
        updateBotAim(bot, botIndex, toTargetX, toTargetY, distanceToTarget, dt, nowMs, easyMode ? 1.2 : 0)
        const farBias = clamp((distanceToTarget - 8) / 24, 0, 1)
        const aimAlignment = bot.aim.x * towardX + bot.aim.y * towardY
        const requiredAlignment = lerp(0.8, 0.91, farBias) + (easyMode ? 0.12 : 0)
        const hesitationChance = Math.min(0.98, lerp(0.02, 0.16, farBias) + (easyMode ? 0.34 : 0))
        const fireDistance = easyMode ? 19 : 32

        if (
          !blockedByIndestructibleCover &&
          distanceToTarget < fireDistance &&
          aimAlignment > requiredAlignment &&
          Math.random() > hesitationChance
        ) {
          deps.firePrimary(bot.id)
        }

        const throwChance = easyMode ? 0.0006 : 0.014
        if (!blockedByIndestructibleCover && distanceToTarget < 12 && Math.random() < throwChance) {
          deps.throwSecondary(bot.id)
        }
      }
    }

    if (bot.aiState === "flee") {
      if (!hasTarget) {
        bot.aiState = "wander"
        continue
      }

      const distanceSafe = distanceToTarget || 1
      const fromX = -toTargetX / distanceSafe
      const fromY = -toTargetY / distanceSafe
      const fleeSpeed = easyMode ? 0.8 : 1.15
      desiredVelocityX = fromX * bot.speed * fleeSpeed
      desiredVelocityY = fromY * bot.speed * fleeSpeed
      const towardX = toTargetX / distanceSafe
      const towardY = toTargetY / distanceSafe
      updateBotAim(bot, botIndex, toTargetX, toTargetY, distanceToTarget, dt, nowMs, easyMode ? 1.3 : 0.45)
      const farBias = clamp((distanceToTarget - 8) / 24, 0, 1)
      const aimAlignment = bot.aim.x * towardX + bot.aim.y * towardY
      const requiredAlignment = lerp(0.78, 0.89, farBias) + (easyMode ? 0.1 : 0)
      const hesitationChance = Math.min(0.98, lerp(0.06, 0.22, farBias) + (easyMode ? 0.26 : 0))
      const fleeFireDistance = easyMode ? 15 : 24

      if (
        !blockedByIndestructibleCover &&
        distanceToTarget < fleeFireDistance &&
        aimAlignment > requiredAlignment &&
        Math.random() > hesitationChance
      ) {
        deps.firePrimary(bot.id)
      }
    }

    const desiredSpeed = Math.hypot(desiredVelocityX, desiredVelocityY)
    const desiredDirX = desiredSpeed > 0 ? desiredVelocityX / desiredSpeed : 0
    const desiredDirY = desiredSpeed > 0 ? desiredVelocityY / desiredSpeed : 0
    const desiredClearance = desiredSpeed > 0 ? clearanceAlongDirection(world, bot, desiredDirX, desiredDirY, 1.1) : 0
    const trappedByGeometry = hasTarget && nearArenaEdge && desiredClearance < 0.25
    if (!easyMode && (blockedByIndestructibleCover || trappedByGeometry)) {
      const escape = findEscapeDirection(world, bot, toTargetX, toTargetY, nearArenaEdge, shotBlocker)
      const escapeSpeed = bot.speed * (nearArenaEdge ? 1 : 0.9)
      desiredVelocityX = escape.dirX * escapeSpeed
      desiredVelocityY = escape.dirY * escapeSpeed

      if (
        escape.blocked && blockedByIndestructibleCover && bot.secondaryMode === "grenade" && bot.secondaryCooldown <= 0
      ) {
        const nearbyObstacle = findNearestSolidCellAround(world, bot.position.x, bot.position.y, 1.8)
        const aimX = nearbyObstacle ? nearbyObstacle.x - bot.position.x : bot.position.x
        const aimY = nearbyObstacle ? nearbyObstacle.y - bot.position.y : bot.position.y
        const aimLength = Math.hypot(aimX, aimY) || 1
        bot.aim.x = aimX / aimLength
        bot.aim.y = aimY / aimLength
        deps.throwSecondary(bot.id)
      }
    }

    const acceleration = easyMode ? 6 : 16
    bot.velocity.x = lerp(bot.velocity.x, desiredVelocityX, clamp(dt * acceleration, 0, 1))
    bot.velocity.y = lerp(bot.velocity.y, desiredVelocityY, clamp(dt * acceleration, 0, 1))

    bot.position.x += bot.velocity.x * dt
    bot.position.y += bot.velocity.y * dt
    limitToArena(bot.position, bot.radius, world.arenaRadius)

    deps.collectNearbyPickup(bot.id)
  }
}
