/// <reference lib="deno.ns" />

import { assertAlmostEquals, assertEquals } from "jsr:@std/assert"

import { explodeGrenade } from "./throwables.ts"
import { createWorldState } from "../world/state.ts"

Deno.test("explodeGrenade forwards explosive power for impulse fling", () => {
  const world = createWorldState()
  const throwable = world.throwables[0]
  const power = 1.75

  throwable.position.set(3, -4)
  throwable.ownerId = world.player.id
  throwable.ownerTeam = world.player.team
  throwable.explosiveRadiusMultiplier = power

  let impulseCalls = 0
  let impulseRadius = 0
  let impulsePower = 0
  let impulseSourceId = ""
  let impulseSourceTeam = "white"

  explodeGrenade(world, 0, {
    applyDamage: () => {},
    damageObstaclesByExplosion: () => {},
    spawnExplosion: () => {},
    applyExplosionImpulse: (_x, _y, radius, explosivePower, sourceId, sourceTeam) => {
      impulseCalls += 1
      impulseRadius = radius
      impulsePower = explosivePower
      impulseSourceId = sourceId
      impulseSourceTeam = sourceTeam
    },
  })

  assertEquals(impulseCalls, 1)
  assertAlmostEquals(impulsePower, power, 0.000001)
  assertAlmostEquals(impulseRadius, 3.8 * power, 0.000001)
  assertEquals(impulseSourceId, world.player.id)
  assertEquals(impulseSourceTeam, world.player.team)
})

Deno.test("explodeGrenade clamps explosive power floor when applying impulse", () => {
  const world = createWorldState()
  const throwable = world.throwables[0]

  throwable.position.set(0, 0)
  throwable.ownerId = world.player.id
  throwable.ownerTeam = world.player.team
  throwable.explosiveRadiusMultiplier = 0.1

  let impulsePower = 0

  explodeGrenade(world, 0, {
    applyDamage: () => {},
    damageObstaclesByExplosion: () => {},
    spawnExplosion: () => {},
    applyExplosionImpulse: (_x, _y, _radius, explosivePower) => {
      impulsePower = explosivePower
    },
  })

  assertAlmostEquals(impulsePower, 0.6, 0.000001)
})
