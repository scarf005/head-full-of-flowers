/// <reference lib="deno.ns" />

import { assertAlmostEquals, assertEquals } from "jsr:@std/assert"

import { updateProjectiles } from "./projectiles.ts"
import { createWorldState } from "../world/state.ts"

Deno.test("updateProjectiles applies damage when a ballistic projectile intersects an enemy", () => {
  const world = createWorldState()
  const player = world.player
  const enemy = world.bots[0]

  player.position.set(0, 0)
  enemy.position.set(1, 0)
  world.units = [player, enemy]
  world.bots = [enemy]

  const projectile = world.projectiles[0]
  projectile.active = true
  projectile.kind = "ballistic"
  projectile.ownerId = player.id
  projectile.ownerTeam = player.team
  projectile.position.set(0, 0)
  projectile.velocity.set(12, 0)
  projectile.radius = 0.1
  projectile.damage = 2
  projectile.maxRange = 100
  projectile.ttl = 2

  let damageCalls = 0
  let damagedTarget = ""

  updateProjectiles(world, 0.1, {
    hitObstacle: () => false,
    spawnFlamePatch: () => {},
    applyDamage: (targetId) => {
      damageCalls += 1
      damagedTarget = targetId
    },
  })

  assertEquals(damageCalls, 1)
  assertEquals(damagedTarget, enemy.id)
  assertEquals(projectile.active, false)
})

Deno.test("updateProjectiles keeps projectile active when no enemy is near its path", () => {
  const world = createWorldState()
  const player = world.player
  const enemy = world.bots[0]

  player.position.set(0, 0)
  enemy.position.set(15, 15)
  world.units = [player, enemy]
  world.bots = [enemy]

  const projectile = world.projectiles[0]
  projectile.active = true
  projectile.kind = "ballistic"
  projectile.ownerId = player.id
  projectile.ownerTeam = player.team
  projectile.position.set(0, 0)
  projectile.velocity.set(10, 0)
  projectile.radius = 0.1
  projectile.damage = 2
  projectile.maxRange = 100
  projectile.ttl = 2

  let damageCalls = 0

  updateProjectiles(world, 0.1, {
    hitObstacle: () => false,
    spawnFlamePatch: () => {},
    applyDamage: () => {
      damageCalls += 1
    },
  })

  assertEquals(damageCalls, 0)
  assertEquals(projectile.active, true)
})

Deno.test("updateProjectiles triggers rocket proximity fuse for nearby enemies", () => {
  const world = createWorldState()
  const player = world.player
  const enemy = world.bots[0]

  player.position.set(0, 0)
  enemy.position.set(0.6, 0)
  world.units = [player, enemy]
  world.bots = [enemy]

  const projectile = world.projectiles[0]
  projectile.active = true
  projectile.kind = "rocket"
  projectile.ownerId = player.id
  projectile.ownerTeam = player.team
  projectile.position.set(0, 0)
  projectile.velocity.set(1, 0)
  projectile.radius = 0.1
  projectile.maxRange = 100
  projectile.ttl = 2

  let explodeCalls = 0

  updateProjectiles(world, 1 / 60, {
    hitObstacle: () => false,
    spawnFlamePatch: () => {},
    explodeProjectile: () => {
      explodeCalls += 1
    },
    applyDamage: () => {},
  })

  assertEquals(explodeCalls, 1)
  assertEquals(projectile.active, false)
})

Deno.test("updateProjectiles applies rocket acceleration each tick", () => {
  const world = createWorldState()
  const player = world.player

  player.position.set(0, 0)
  world.units = [player]
  world.bots = []

  const projectile = world.projectiles[0]
  projectile.active = true
  projectile.kind = "rocket"
  projectile.ownerId = player.id
  projectile.ownerTeam = player.team
  projectile.position.set(0, 0)
  projectile.velocity.set(10, 0)
  projectile.acceleration = 5
  projectile.radius = 0.1
  projectile.maxRange = 100
  projectile.ttl = 2

  updateProjectiles(world, 0.2, {
    hitObstacle: () => false,
    spawnFlamePatch: () => {},
    explodeProjectile: () => {},
    applyDamage: () => {},
  })

  assertAlmostEquals(Math.hypot(projectile.velocity.x, projectile.velocity.y), 11, 0.000001)
  assertEquals(projectile.active, true)
})

Deno.test("updateProjectiles keeps rocket acceleration increasing speed even in late flight", () => {
  const world = createWorldState()
  const player = world.player

  player.position.set(0, 0)
  world.units = [player]
  world.bots = []

  const projectile = world.projectiles[0]
  projectile.active = true
  projectile.kind = "rocket"
  projectile.ownerId = player.id
  projectile.ownerTeam = player.team
  projectile.position.set(0, 0)
  projectile.velocity.set(10, 0)
  projectile.acceleration = 5
  projectile.radius = 0.1
  projectile.maxRange = 100
  projectile.traveled = 80
  projectile.ttl = 2

  updateProjectiles(world, 0.2, {
    hitObstacle: () => false,
    spawnFlamePatch: () => {},
    explodeProjectile: () => {},
    applyDamage: () => {},
  })

  assertAlmostEquals(Math.hypot(projectile.velocity.x, projectile.velocity.y), 11, 0.000001)
  assertEquals(projectile.active, true)
})

Deno.test("updateProjectiles applies projectile proximity bonus additively for rocket fuse", () => {
  const runFuse = (proximityRadiusBonus: number) => {
    const world = createWorldState()
    const player = world.player
    const enemy = world.bots[0]

    player.position.set(0, 0)
    enemy.position.set(0.008, 15.65)
    world.units = [player, enemy]
    world.bots = [enemy]

    const projectile = world.projectiles[0]
    projectile.active = true
    projectile.kind = "rocket"
    projectile.ownerId = player.id
    projectile.ownerTeam = player.team
    projectile.position.set(0, 0)
    projectile.velocity.set(1, 0)
    projectile.radius = 0.1
    projectile.maxRange = 100
    projectile.ttl = 2
    projectile.proximityRadiusBonus = proximityRadiusBonus

    let explodeCalls = 0

    updateProjectiles(world, 1 / 60, {
      hitObstacle: () => false,
      spawnFlamePatch: () => {},
      explodeProjectile: () => {
        explodeCalls += 1
      },
      applyDamage: () => {},
    })

    return explodeCalls
  }

  assertEquals(runFuse(0), 0)
  assertEquals(runFuse(0.45), 1)
})

Deno.test("updateProjectiles triggers grenade proximity fuse near enemy even without contact-fuse perk", () => {
  const world = createWorldState()
  const player = world.player
  const enemy = world.bots[0]

  player.position.set(0, 0)
  enemy.position.set(1, 0)
  world.units = [player, enemy]
  world.bots = [enemy]

  const projectile = world.projectiles[0]
  projectile.active = true
  projectile.kind = "grenade"
  projectile.contactFuse = false
  projectile.ownerId = player.id
  projectile.ownerTeam = player.team
  projectile.position.set(0, 0)
  projectile.velocity.set(20, 0)
  projectile.radius = 0.1
  projectile.maxRange = 100
  projectile.ttl = 2

  let explodeCalls = 0

  updateProjectiles(world, 0.1, {
    hitObstacle: () => false,
    spawnFlamePatch: () => {},
    explodeProjectile: () => {
      explodeCalls += 1
    },
    applyDamage: () => {},
  })

  assertEquals(explodeCalls, 1)
  assertEquals(projectile.active, false)
})

Deno.test("updateProjectiles grenade proximity fuse ignores nearby teammates", () => {
  const world = createWorldState()
  const player = world.player
  const teammate = world.bots[0]

  player.position.set(0, 0)
  teammate.team = player.team
  teammate.position.set(0.6, 0)
  world.units = [player, teammate]
  world.bots = [teammate]

  const projectile = world.projectiles[0]
  projectile.active = true
  projectile.kind = "grenade"
  projectile.contactFuse = false
  projectile.ownerId = player.id
  projectile.ownerTeam = player.team
  projectile.position.set(0, 0)
  projectile.velocity.set(1, 0)
  projectile.radius = 0.1
  projectile.maxRange = 100
  projectile.ttl = 2

  let explodeCalls = 0

  updateProjectiles(world, 1 / 60, {
    hitObstacle: () => false,
    spawnFlamePatch: () => {},
    explodeProjectile: () => {
      explodeCalls += 1
    },
    applyDamage: () => {},
  })

  assertEquals(explodeCalls, 0)
  assertEquals(projectile.active, true)
})

Deno.test("updateProjectiles deactivates slow grenade after ricochet", () => {
  const world = createWorldState()
  const player = world.player
  const projectile = world.projectiles[0]

  world.units = [player]
  world.bots = []

  projectile.active = true
  projectile.kind = "grenade"
  projectile.ownerId = player.id
  projectile.ownerTeam = player.team
  projectile.position.set(0, 0)
  projectile.velocity.set(1, 0)
  projectile.radius = 0.1
  projectile.maxRange = 100
  projectile.ttl = 2
  projectile.ricochets = 0

  let explodeCalls = 0
  const originalRandom = Math.random
  Math.random = () => 0.5

  try {
    updateProjectiles(world, 0.1, {
      hitObstacle: () => true,
      spawnFlamePatch: () => {},
      explodeProjectile: () => {
        explodeCalls += 1
      },
      applyDamage: () => {},
    })
  } finally {
    Math.random = originalRandom
  }

  assertEquals(explodeCalls, 1)
  assertEquals(projectile.active, false)
})

Deno.test("updateProjectiles broadphase handles dense unit clusters and still hits intended enemy", () => {
  const world = createWorldState()
  const player = world.player
  const bots = world.bots.slice(0, 7)
  const targetEnemy = bots[0]

  player.position.set(0, 0)
  player.team = "white"
  targetEnemy.team = "red"
  targetEnemy.position.set(1, 0)

  for (let index = 1; index < bots.length; index += 1) {
    const bot = bots[index]
    bot.team = index % 2 === 0 ? "white" : "red"
    bot.position.set(0.5 + index * 0.1, 1.2 + index * 0.1)
  }

  world.bots = bots
  world.units = [player, ...bots]

  const projectile = world.projectiles[0]
  projectile.active = true
  projectile.kind = "ballistic"
  projectile.ownerId = player.id
  projectile.ownerTeam = player.team
  projectile.position.set(0, 0)
  projectile.velocity.set(20, 0)
  projectile.radius = 0.1
  projectile.damage = 2
  projectile.maxRange = 100
  projectile.ttl = 2

  let damageCalls = 0
  let damagedTarget = ""

  updateProjectiles(world, 0.1, {
    hitObstacle: () => false,
    spawnFlamePatch: () => {},
    applyDamage: (targetId) => {
      damageCalls += 1
      damagedTarget = targetId
    },
  })

  assertEquals(damageCalls, 1)
  assertEquals(damagedTarget, targetEnemy.id)
  assertEquals(projectile.active, false)
})
