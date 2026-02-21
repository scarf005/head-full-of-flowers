import { damageObstaclesByExplosion } from "./collisions.ts"
import { destroyPickupsByExplosion } from "./pickups.ts"
import { clamp, randomRange } from "../utils.ts"
import type { Team } from "../types.ts"
import type { WorldState } from "../world/state.ts"

const EXPLOSION_UNIT_FLING_BASE = 6.5
const EXPLOSION_UNIT_FLING_RADIUS_MULTIPLIER = 2.4

export const applyExplosionImpulse = (
  world: WorldState,
  x: number,
  y: number,
  radius: number,
  explosivePower: number,
  sourceId: string,
  sourceTeam: Team,
) => {
  if (radius <= 0.001) {
    return
  }

  const radiusSq = radius * radius
  const resolvedPower = Math.max(0.4, explosivePower)

  for (const unit of world.units) {
    if (unit.team === sourceTeam && unit.id !== sourceId) {
      continue
    }

    const dx = unit.position.x - x
    const dy = unit.position.y - y
    const dsq = dx * dx + dy * dy
    if (dsq > radiusSq) {
      continue
    }

    const distance = Math.sqrt(dsq)
    const falloff = 1 - clamp(distance / radius, 0, 1)
    if (falloff <= 0) {
      continue
    }

    let dirX = 1
    let dirY = 0
    if (distance > 0.0001) {
      dirX = dx / distance
      dirY = dy / distance
    } else {
      const angle = randomRange(0, Math.PI * 2)
      dirX = Math.cos(angle)
      dirY = Math.sin(angle)
    }

    const unitImpulse = (EXPLOSION_UNIT_FLING_BASE + radius * EXPLOSION_UNIT_FLING_RADIUS_MULTIPLIER) *
      resolvedPower *
      (0.25 + falloff * 0.75)
    unit.velocity.x += dirX * unitImpulse
    unit.velocity.y += dirY * unitImpulse
  }

  destroyPickupsByExplosion(world, x, y, radius)
}

interface ExplosionObstacleFxDeps {
  onSfxHit: () => void
  onSfxBreak: () => void
  onObstacleDamaged: (chipX: number, chipY: number, material: number, damage: number) => void
  onObstacleDestroyed: (dropX: number, dropY: number, material: number) => void
  onBoxDestroyed: (dropX: number, dropY: number, highTier: boolean) => void
}

interface ExplodeProjectilePayloadDeps extends ExplosionObstacleFxDeps {
  applyDamage: (
    targetId: string,
    amount: number,
    sourceId: string,
    sourceTeam: Team,
    hitX: number,
    hitY: number,
    impactX: number,
    impactY: number,
  ) => void
  spawnExplosion: (x: number, y: number, radius: number) => void
  onExplosion: () => void
}

const applyRadialExplosionDamage = (
  world: WorldState,
  x: number,
  y: number,
  radius: number,
  damage: number,
  sourceId: string,
  sourceTeam: Team,
  applyDamage: ExplodeProjectilePayloadDeps["applyDamage"],
  useFalloff = false,
  explosivePower = 1,
) => {
  applyExplosionImpulse(world, x, y, radius, explosivePower, sourceId, sourceTeam)
  const radiusSq = radius * radius
  for (const unit of world.units) {
    if (unit.team === sourceTeam && unit.id !== sourceId) {
      continue
    }

    const dsq = (unit.position.x - x) ** 2 + (unit.position.y - y) ** 2
    if (dsq > radiusSq) {
      continue
    }

    const distance = Math.sqrt(dsq)
    const falloff = 1 - clamp(distance / radius, 0, 1)
    const resolvedDamage = useFalloff ? Math.max(1, damage * (0.35 + falloff * 0.65)) : damage

    applyDamage(
      unit.id,
      resolvedDamage,
      sourceId,
      sourceTeam,
      unit.position.x,
      unit.position.y,
      unit.position.x - x,
      unit.position.y - y,
    )
  }
}

const damageObstaclesAtExplosion = (
  world: WorldState,
  x: number,
  y: number,
  radius: number,
  deps: ExplosionObstacleFxDeps,
) => {
  damageObstaclesByExplosion(world, x, y, radius, {
    onSfxHit: deps.onSfxHit,
    onSfxBreak: deps.onSfxBreak,
    onObstacleDamaged: deps.onObstacleDamaged,
    onObstacleDestroyed: deps.onObstacleDestroyed,
    onBoxDestroyed: deps.onBoxDestroyed,
  })
}

export const explodeProjectilePayload = (
  world: WorldState,
  projectile: WorldState["projectiles"][number],
  deps: ExplodeProjectilePayloadDeps,
) => {
  const explosionScale = Math.max(0.6, projectile.explosiveRadiusMultiplier)
  if (projectile.kind === "grenade") {
    const explosionRadius = 3.8 * explosionScale
    deps.spawnExplosion(projectile.position.x, projectile.position.y, explosionRadius)
    applyRadialExplosionDamage(
      world,
      projectile.position.x,
      projectile.position.y,
      explosionRadius,
      projectile.damage,
      projectile.ownerId,
      projectile.ownerTeam,
      deps.applyDamage,
      false,
      explosionScale,
    )
    damageObstaclesAtExplosion(world, projectile.position.x, projectile.position.y, explosionRadius, deps)
    world.cameraShake = Math.min(1.6, world.cameraShake + 0.24)
    world.hitStop = Math.max(world.hitStop, 0.01)
    deps.onExplosion()
    return
  }

  if (projectile.kind !== "rocket") {
    return
  }

  const grenadeExplosionRadius = 3.8 * explosionScale
  const explosionRadius = grenadeExplosionRadius * 1.4
  deps.spawnExplosion(projectile.position.x, projectile.position.y, explosionRadius)
  applyRadialExplosionDamage(
    world,
    projectile.position.x,
    projectile.position.y,
    explosionRadius,
    20,
    projectile.ownerId,
    projectile.ownerTeam,
    deps.applyDamage,
    false,
    explosionScale,
  )
  damageObstaclesAtExplosion(world, projectile.position.x, projectile.position.y, explosionRadius, deps)

  world.cameraShake = Math.min(2.4, world.cameraShake + 0.42)
  world.hitStop = Math.max(world.hitStop, 0.016)
  deps.onExplosion()
}
