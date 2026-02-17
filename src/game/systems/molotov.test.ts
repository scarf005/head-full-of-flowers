/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { BURNED_FACTION_ID, BURNED_FLOWER_ACCENT, BURNED_FLOWER_COLOR } from "../factions.ts"
import { updateMolotovZones } from "./molotov.ts"
import { createWorldState } from "../world/state.ts"

Deno.test("updateMolotovZones scorches flowers and updates score buckets", () => {
  const world = createWorldState()
  world.units = []

  const flower = world.flowers[0]
  flower.active = true
  flower.slotIndex = 0
  flower.ownerId = world.player.id
  flower.color = "#ffffff"
  flower.accent = "#aaaaaa"
  flower.scorched = false
  flower.renderDirty = false
  flower.position.set(0, 0)

  const size = world.terrainMap.size
  const half = Math.floor(size * 0.5)
  const cellIndex = half * size + half
  flower.bloomCell = cellIndex
  flower.prevInCell = -1
  flower.nextInCell = -1
  world.flowerCellHead.fill(-1)
  world.flowerCellHead[cellIndex] = 0

  world.factionFlowerCounts[world.player.id] = 1
  world.factionFlowerCounts[BURNED_FACTION_ID] = 0

  const zone = world.molotovZones[0]
  zone.active = true
  zone.source = "flame"
  zone.ownerId = world.bots[0].id
  zone.ownerTeam = world.bots[0].team
  zone.position.set(0, 0)
  zone.radius = 1.5
  zone.life = 1
  zone.tick = 0
  zone.tickInterval = 1
  zone.damagePerTick = 1

  updateMolotovZones(world, 0.1, {
    applyDamage: () => {},
  })

  assertEquals(flower.scorched, true)
  assertEquals(flower.color, BURNED_FLOWER_COLOR)
  assertEquals(flower.accent, BURNED_FLOWER_ACCENT)
  assertEquals(world.factionFlowerCounts[world.player.id], 0)
  assertEquals(world.factionFlowerCounts[BURNED_FACTION_ID], 1)
  assertEquals(world.flowerDirtyIndices.has(flower.slotIndex), true)
  assertEquals(world.flowerDirtyCount, 1)
})

Deno.test("updateMolotovZones skips non-owner teammates for damage ticks", () => {
  const world = createWorldState()
  const owner = world.bots[0]
  const teammate = world.bots[1]
  const enemy = world.player

  owner.team = "blue"
  teammate.team = "blue"
  enemy.team = "red"

  owner.position.set(0.2, 0)
  teammate.position.set(0.2, 0)
  enemy.position.set(0.2, 0)
  world.units = [owner, teammate, enemy]
  world.bots = [owner, teammate]

  const zone = world.molotovZones[0]
  zone.active = true
  zone.source = "molotov"
  zone.ownerId = owner.id
  zone.ownerTeam = owner.team
  zone.position.set(0, 0)
  zone.radius = 1
  zone.life = 1
  zone.tick = 0
  zone.tickInterval = 1
  zone.damagePerTick = 1

  const damagedTargets: string[] = []
  updateMolotovZones(world, 0.1, {
    applyDamage: (targetId) => {
      damagedTargets.push(targetId)
    },
  })

  assertEquals(damagedTargets.includes(owner.id), true)
  assertEquals(damagedTargets.includes(teammate.id), false)
  assertEquals(damagedTargets.includes(enemy.id), true)
})
