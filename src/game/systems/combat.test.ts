/// <reference lib="deno.ns" />

import { assertAlmostEquals, assertEquals } from "jsr:@std/assert"

import { applyDamage } from "./combat.ts"
import { createWorldState } from "../world/state.ts"

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

Deno.test("applyDamage attributes arena boundary flowers to the damaged unit", () => {
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

  assertEquals(flowerOwnerId, target.id)
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
