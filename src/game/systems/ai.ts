import { clamp, distSquared, lerp, limitToArena, randomRange } from "../utils.ts"
import type { WorldState } from "../world/state.ts"

const findNearestTarget = (world: WorldState, originId: string, x: number, y: number, maxDistance = Number.POSITIVE_INFINITY) => {
  let targetId = ""
  let bestDistance = maxDistance
  let deltaX = 0
  let deltaY = 0

  for (const candidate of world.units) {
    if (candidate.id === originId) {
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
    deltaY
  }
}

export interface UpdateAIDeps {
  firePrimary: (botId: string) => void
  throwSecondary: (botId: string) => void
  finishReload: (botId: string) => void
  collectNearbyPickup: (botId: string) => void
  nowMs: () => number
}

export const updateAI = (world: WorldState, dt: number, deps: UpdateAIDeps) => {
  for (const bot of world.bots) {
    bot.shootCooldown = Math.max(0, bot.shootCooldown - dt)
    bot.secondaryCooldown = Math.max(0, bot.secondaryCooldown - dt)
    bot.reloadCooldown = Math.max(0, bot.reloadCooldown - dt)
    if (bot.reloadCooldown <= 0) {
      deps.finishReload(bot.id)
    }
    bot.aiDecisionTimer -= dt
    let desiredVelocityX = bot.velocity.x
    let desiredVelocityY = bot.velocity.y

    const nearestTarget = findNearestTarget(world, bot.id, bot.position.x, bot.position.y, 36)
    const hasTarget = nearestTarget.targetId !== ""
    const distanceToTarget = nearestTarget.distance
    const toTargetX = nearestTarget.deltaX
    const toTargetY = nearestTarget.deltaY

    if (bot.hp <= bot.maxHp * 0.32) {
      bot.aiState = "flee"
    } else if (hasTarget && distanceToTarget < 24) {
      bot.aiState = "aggro"
    } else {
      bot.aiState = "wander"
    }

    if (bot.aiDecisionTimer <= 0) {
      bot.aiDecisionTimer = randomRange(0.4, 1.4)
      const angle = randomRange(0, Math.PI * 2)
      bot.aiMove.x = Math.cos(angle)
      bot.aiMove.y = Math.sin(angle)
    }

    if (bot.aiState === "wander") {
      desiredVelocityX = bot.aiMove.x * bot.speed * 0.7
      desiredVelocityY = bot.aiMove.y * bot.speed * 0.7
    }

    if (bot.aiState === "aggro") {
      if (!hasTarget) {
        bot.aiState = "wander"
        continue
      }

      const distanceSafe = distanceToTarget || 1
      const towardX = toTargetX / distanceSafe
      const towardY = toTargetY / distanceSafe
      const strafe = Math.sin(deps.nowMs() * 0.001 + Number(bot.id.replace("bot-", "")))
      desiredVelocityX = (towardX + -towardY * strafe * 0.45) * bot.speed
      desiredVelocityY = (towardY + towardX * strafe * 0.45) * bot.speed

      bot.aim.x = towardX
      bot.aim.y = towardY

      if (distanceToTarget < 32) {
        deps.firePrimary(bot.id)
      }

      if (distanceToTarget < 12 && Math.random() < 0.014) {
        deps.throwSecondary(bot.id)
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
      desiredVelocityX = fromX * bot.speed * 1.15
      desiredVelocityY = fromY * bot.speed * 1.15
      bot.aim.x = toTargetX / distanceSafe
      bot.aim.y = toTargetY / distanceSafe

      if (distanceToTarget < 24) {
        deps.firePrimary(bot.id)
      }
    }

    bot.velocity.x = lerp(bot.velocity.x, desiredVelocityX, clamp(dt * 16, 0, 1))
    bot.velocity.y = lerp(bot.velocity.y, desiredVelocityY, clamp(dt * 16, 0, 1))

    bot.position.x += bot.velocity.x * dt
    bot.position.y += bot.velocity.y * dt
    limitToArena(bot.position, bot.radius, world.arenaRadius)

    deps.collectNearbyPickup(bot.id)
  }
}
