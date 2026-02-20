/// <reference lib="deno.ns" />

import { assertAlmostEquals, assertEquals } from "jsr:@std/assert"

import { applyDamage, equipPrimary, firePrimary, startReload } from "./combat.ts"
import { updateProjectiles } from "./projectiles.ts"
import { createWorldState } from "../world/state.ts"
import { BURNED_FACTION_ID } from "../factions.ts"
import { applyPerkToUnit } from "../perks.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"

Deno.test("applyDamage keeps vectors finite for zero impact direction", () => {
  const world = createWorldState()
  const attacker = world.player
  const target = world.bots[0]

  attacker.position.set(0, 0)
  target.position.set(1, 0)
  world.units = [attacker, target]
  world.bots = [target]

  applyDamage(
    world,
    target.id,
    2,
    attacker.id,
    attacker.team,
    target.position.x,
    target.position.y,
    0,
    0,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: () => {},
      respawnUnit: () => {},
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
    },
  )

  assertEquals(Number.isFinite(target.velocity.x), true)
  assertEquals(Number.isFinite(target.velocity.y), true)
  assertEquals(Number.isFinite(world.cameraKick.x), true)
  assertEquals(Number.isFinite(world.cameraKick.y), true)
})

Deno.test("applyDamage honors injected infinite hp toggle for player targets", () => {
  const world = createWorldState()
  const attacker = world.bots[0]
  const player = world.player

  attacker.position.set(0, 0)
  player.position.set(1, 0)
  world.units = [player, attacker]
  world.bots = [attacker]

  applyDamage(
    world,
    player.id,
    5,
    attacker.id,
    attacker.team,
    player.position.x,
    player.position.y,
    1,
    0,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: () => {},
      respawnUnit: () => {},
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
      isInfiniteHpEnabled: () => true,
    },
  )

  assertEquals(player.hp, player.maxHp)
})

Deno.test("applyDamage makes self-inflicted explosive hits lethal", () => {
  const world = createWorldState()
  const player = world.player

  player.position.set(0, 0)
  player.damageReductionFlat = 9
  player.damageTakenMultiplier = 0.1
  world.units = [player]
  world.bots = []

  applyDamage(
    world,
    player.id,
    5,
    player.id,
    player.team,
    player.position.x,
    player.position.y,
    1,
    0,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: () => {},
      respawnUnit: () => {},
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
    },
    "projectile",
  )

  assertEquals(player.hp, 0)
})

Deno.test("applyDamage ignores friendly fire from non-self sources", () => {
  const world = createWorldState()
  const attacker = world.bots[0]
  const target = world.bots[1]

  attacker.team = "blue"
  target.team = "blue"
  attacker.position.set(0, 0)
  target.position.set(1, 0)
  world.units = [attacker, target]
  world.bots = [attacker, target]

  const hpBefore = target.hp

  applyDamage(
    world,
    target.id,
    4,
    attacker.id,
    attacker.team,
    target.position.x,
    target.position.y,
    1,
    0,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: () => {},
      respawnUnit: () => {},
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
    },
  )

  assertEquals(target.hp, hpBefore)
})

Deno.test("applyDamage grants killer hp bonus on lethal hit and triggers respawn", () => {
  const world = createWorldState()
  const attacker = world.player
  const target = world.bots[0]

  attacker.hp = 4
  target.hp = 1
  attacker.position.set(0, 0)
  target.position.set(1, 0)
  world.units = [attacker, target]
  world.bots = [target]

  let respawnedId = ""

  applyDamage(
    world,
    target.id,
    3,
    attacker.id,
    attacker.team,
    target.position.x,
    target.position.y,
    1,
    0,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: () => {},
      respawnUnit: (unitId) => {
        respawnedId = unitId
      },
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
    },
  )

  assertEquals(attacker.hp, 7)
  assertEquals(respawnedId, target.id)
  assertAlmostEquals(world.cameraShake, 0.48 * 5, 0.00001)
})

Deno.test("applyDamage forwards lethal impact context for ragdoll momentum", () => {
  const world = createWorldState()
  const attacker = world.player
  const target = world.bots[0]

  target.hp = 1
  attacker.position.set(0, 0)
  target.position.set(1, 0)
  world.units = [attacker, target]
  world.bots = [target]

  let killCaptured = false
  let killImpulse: {
    impactX: number
    impactY: number
    damage: number
    damageSource: string
  } = {
    impactX: 0,
    impactY: 0,
    damage: 0,
    damageSource: "other",
  }

  applyDamage(
    world,
    target.id,
    4,
    attacker.id,
    attacker.team,
    target.position.x,
    target.position.y,
    3,
    4,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: () => {},
      respawnUnit: () => {},
      onUnitKilled: (_target, _isSuicide, _killer, impulse) => {
        killCaptured = true
        killImpulse = impulse
      },
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
    },
    "throwable",
  )

  assertEquals(killCaptured, true)
  assertEquals(killImpulse.impactX, 3)
  assertEquals(killImpulse.impactY, 4)
  assertEquals(killImpulse.damageSource, "throwable")
  assertEquals(killImpulse.damage > 0, true)
})

Deno.test("applyDamage halves off-screen shake for non-player source hits", () => {
  const world = createWorldState()
  const attacker = world.bots[0]
  const target = world.bots[1]

  attacker.team = "blue"
  target.team = "red"
  attacker.position.set(100, 100)
  target.position.set(100, 100)
  world.units = [world.player, attacker, target]
  world.bots = [attacker, target]

  applyDamage(
    world,
    target.id,
    2,
    attacker.id,
    attacker.team,
    target.position.x,
    target.position.y,
    1,
    0,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: () => {},
      respawnUnit: () => {},
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
    },
  )

  assertAlmostEquals(world.cameraShake, 0.045, 0.00001)
})

Deno.test("applyDamage resolves non-unit source fallback to nearest teammate for attribution", () => {
  const world = createWorldState()
  const attacker = world.player
  const target = world.bots[0]

  attacker.position.set(0, 0)
  target.position.set(1, 0)
  world.units = [attacker, target]
  world.bots = [target]

  let flowerOwnerId = ""

  applyDamage(
    world,
    target.id,
    2,
    "unknown-source",
    attacker.team,
    target.position.x,
    target.position.y,
    1,
    0,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: (ownerId) => {
        flowerOwnerId = ownerId
      },
      respawnUnit: () => {},
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
    },
  )

  assertEquals(flowerOwnerId, attacker.id)
})

Deno.test("applyDamage attributes arena boundary flowers to neutral burnt faction", () => {
  const world = createWorldState()
  const target = world.player

  let flowerOwnerId = ""
  let burntFlag = false

  applyDamage(
    world,
    target.id,
    2,
    "arena",
    target.team,
    target.position.x,
    target.position.y,
    0,
    0,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: (ownerId, _x, _y, _dirX, _dirY, _amount, _sizeScale, isBurnt) => {
        flowerOwnerId = ownerId
        burntFlag = isBurnt === true
      },
      respawnUnit: () => {},
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
    },
    "arena",
  )

  assertEquals(flowerOwnerId, BURNED_FACTION_ID)
  assertEquals(burntFlag, false)
})

Deno.test("applyDamage skips dead-team fallback attribution for non-unit sources", () => {
  const world = createWorldState()
  const target = world.player
  const deadFallback = world.bots[0]

  target.hp = 1
  deadFallback.hp = 0
  deadFallback.position.set(0, 0)
  target.position.set(1, 0)
  world.units = [target, deadFallback]
  world.bots = [deadFallback]

  let killerId = ""
  let respawnedId = ""

  applyDamage(
    world,
    target.id,
    2,
    "unknown-source",
    deadFallback.team,
    target.position.x,
    target.position.y,
    1,
    0,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: () => {},
      respawnUnit: (unitId) => {
        respawnedId = unitId
      },
      onUnitKilled: (_killed, _isSuicide, killer) => {
        killerId = killer?.id ?? ""
      },
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
    },
  )

  assertEquals(killerId, "")
  assertEquals(deadFallback.hp, 0)
  assertEquals(respawnedId, target.id)
})

Deno.test("applyDamage completes in-progress reload before respawn on lethal hit", () => {
  const world = createWorldState()
  const attacker = world.player
  const target = world.bots[0]

  world.units = [attacker, target]
  world.bots = [target]
  target.hp = 1
  target.position.set(1, 0)
  attacker.position.set(0, 0)

  equipPrimary(target.id, world, "assault", 40, () => {})
  const slot = target.primarySlots[target.primarySlotIndex]
  slot.primaryAmmo = 5
  slot.reserveAmmo = 10
  target.primaryAmmo = 5
  target.reserveAmmo = 10
  target.magazineSize = slot.magazineSize
  target.reloadCooldown = 0.4
  target.reloadCooldownMax = 1.2

  applyDamage(
    world,
    target.id,
    2,
    attacker.id,
    attacker.team,
    target.position.x,
    target.position.y,
    1,
    0,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: () => {},
      respawnUnit: () => {},
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
    },
  )

  const activeSlot = target.primarySlots[target.primarySlotIndex]
  assertEquals(activeSlot.primaryAmmo, 15)
  assertEquals(activeSlot.reserveAmmo, 0)
  assertEquals(target.primaryAmmo, 15)
  assertEquals(target.reserveAmmo, 0)
  assertEquals(target.reloadCooldown, 0)
  assertEquals(target.reloadCooldownMax, 0)
})

Deno.test("applyDamage grants kill_reload perk bonus to next reload only", () => {
  const world = createWorldState()
  const attacker = world.player
  const target = world.bots[0]

  world.units = [attacker, target]
  world.bots = [target]

  applyPerkToUnit(attacker, "kill_reload")
  equipPrimary(attacker.id, world, "assault", 40, () => {})
  const attackerSlot = attacker.primarySlots[attacker.primarySlotIndex]
  attackerSlot.primaryAmmo = 2
  attackerSlot.reserveAmmo = 20
  attacker.primaryAmmo = 2
  attacker.reserveAmmo = 20
  attacker.magazineSize = attackerSlot.magazineSize

  attacker.position.set(0, 0)
  target.position.set(1, 0)
  target.hp = 1

  applyDamage(
    world,
    target.id,
    2,
    attacker.id,
    attacker.team,
    target.position.x,
    target.position.y,
    1,
    0,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: () => {},
      respawnUnit: () => {},
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
    },
  )

  assertAlmostEquals(attacker.nextReloadTimeMultiplier, 0.5, 0.000001)

  startReload(attacker.id, world, () => {})
  assertAlmostEquals(attacker.reloadCooldown, PRIMARY_WEAPONS.assault.reload * 0.5, 0.000001)
  assertAlmostEquals(attacker.reloadCooldownMax, PRIMARY_WEAPONS.assault.reload * 0.5, 0.000001)
  assertEquals(attacker.nextReloadTimeMultiplier, 1)

  attacker.reloadCooldown = 0
  attacker.reloadCooldownMax = 0
  startReload(attacker.id, world, () => {})
  assertAlmostEquals(attacker.reloadCooldown, PRIMARY_WEAPONS.assault.reload, 0.000001)
})

Deno.test("applyDamage marks self-inflicted explosive damage flowers as burnt", () => {
  const world = createWorldState()
  const player = world.player

  player.position.set(0, 0)
  world.units = [player]
  world.bots = []

  let flowerOwnerId = ""
  let burntFlag = false

  applyDamage(
    world,
    player.id,
    1,
    player.id,
    player.team,
    player.position.x,
    player.position.y,
    1,
    0,
    {
      allocPopup: () => world.damagePopups[0],
      spawnFlowers: (ownerId, _x, _y, _dirX, _dirY, _amount, _sizeScale, isBurnt) => {
        flowerOwnerId = ownerId
        burntFlag = isBurnt === true
      },
      respawnUnit: () => {},
      onSfxHit: () => {},
      onSfxDeath: () => {},
      onSfxPlayerDeath: () => {},
      onSfxPlayerKill: () => {},
      onPlayerHpChanged: () => {},
    },
    "projectile",
  )

  assertEquals(flowerOwnerId, BURNED_FACTION_ID)
  assertEquals(burntFlag, true)
})

Deno.test("firePrimary applies laser range bonus and additive proximity stats to rocket-launcher projectile", () => {
  const world = createWorldState()
  const shooter = world.player

  world.units = [shooter]
  world.bots = []
  shooter.position.set(0, 0)
  shooter.aim.set(1, 0)

  applyPerkToUnit(shooter, "laser_sight")
  applyPerkToUnit(shooter, "proximity_grenades")
  equipPrimary(shooter.id, world, "rocket-launcher", 1, () => {})

  firePrimary(world, shooter.id, {
    allocProjectile: () => world.projectiles[0],
    startReload: () => {},
    onPlayerShoot: () => {},
    onOtherShoot: () => {},
  })

  const projectile = world.projectiles[0]
  assertEquals(projectile.active, true)
  assertEquals(projectile.kind, "rocket")
  assertAlmostEquals(projectile.maxRange, PRIMARY_WEAPONS["rocket-launcher"].range * 1.2, 0.000001)
  assertAlmostEquals(projectile.proximityRadiusBonus, 0.45, 0.000001)
  assertEquals(projectile.acceleration, PRIMARY_WEAPONS["rocket-launcher"].projectileAcceleration ?? 0)
})

Deno.test("firePrimary adds +1 projectile damage when heavy pellets perk is active", () => {
  const world = createWorldState()
  const shooter = world.player

  world.units = [shooter]
  world.bots = []
  shooter.position.set(0, 0)
  shooter.aim.set(1, 0)

  applyPerkToUnit(shooter, "heavy_pellets")
  equipPrimary(shooter.id, world, "assault", 1, () => {})

  firePrimary(world, shooter.id, {
    allocProjectile: () => world.projectiles[0],
    startReload: () => {},
    onPlayerShoot: () => {},
    onOtherShoot: () => {},
  })

  const projectile = world.projectiles[0]
  assertEquals(projectile.active, true)
  assertAlmostEquals(projectile.damage, PRIMARY_WEAPONS.assault.damage + 1, 0.000001)
  assertAlmostEquals(projectile.radius, PRIMARY_WEAPONS.assault.bulletRadius * 1.5, 0.000001)
})

Deno.test("firePrimary emits muzzle flash callback with weapon and angle", () => {
  const world = createWorldState()
  const shooter = world.player

  world.units = [shooter]
  world.bots = []
  shooter.position.set(0, 0)
  shooter.aim.set(1, 0)
  equipPrimary(shooter.id, world, "assault", 1, () => {})

  let muzzleFlashCount = 0
  let muzzleWeapon = ""
  let muzzleAngle = Number.NaN

  firePrimary(world, shooter.id, {
    allocProjectile: () => world.projectiles[0],
    startReload: () => {},
    onPlayerShoot: () => {},
    onOtherShoot: () => {},
    onMuzzleFlash: (_unit, shotAngle, weaponId) => {
      muzzleFlashCount += 1
      muzzleWeapon = weaponId
      muzzleAngle = shotAngle
    },
  })

  assertEquals(muzzleFlashCount, 1)
  assertEquals(muzzleWeapon, "assault")
  assertAlmostEquals(muzzleAngle, 0, 0.000001)
})

Deno.test("firePrimary uses rocket weapon config acceleration in runtime projectile updates", () => {
  const world = createWorldState()
  const shooter = world.player

  world.units = [shooter]
  world.bots = []
  world.arenaRadius = 10000
  shooter.position.set(0, 0)
  shooter.aim.set(1, 0)

  equipPrimary(shooter.id, world, "rocket-launcher", 1, () => {})

  firePrimary(world, shooter.id, {
    allocProjectile: () => world.projectiles[0],
    startReload: () => {},
    onPlayerShoot: () => {},
    onOtherShoot: () => {},
  })

  const projectile = world.projectiles[0]
  const startSpeed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
  const dt = 0.25

  updateProjectiles(world, dt, {
    hitObstacle: () => false,
    spawnFlamePatch: () => {},
    explodeProjectile: () => {},
    applyDamage: () => {},
  })

  const nextSpeed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
  const expectedDelta = (PRIMARY_WEAPONS["rocket-launcher"].projectileAcceleration ?? 0) * dt

  assertAlmostEquals(nextSpeed - startSpeed, expectedDelta, 0.000001)
  assertEquals(projectile.active, true)
})
