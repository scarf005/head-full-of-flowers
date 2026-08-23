/// <reference lib="deno.ns" />

import { assertAlmostEquals, assertEquals } from "jsr:@std/assert"

import { WEAPON_SFX_MAX_DISTANCE_METERS, weaponSfxVolumeMultiplierForDistance } from "./weapon-sfx-distance.ts"

Deno.test("weapon SFX keeps full volume at the player", () => {
  assertEquals(weaponSfxVolumeMultiplierForDistance(0), 1)
})

Deno.test("weapon SFX fades linearly by distance in meters", () => {
  assertAlmostEquals(weaponSfxVolumeMultiplierForDistance(20), 0.5, 0.000001)
})

Deno.test("weapon SFX is silent at and beyond the maximum distance", () => {
  assertEquals(weaponSfxVolumeMultiplierForDistance(WEAPON_SFX_MAX_DISTANCE_METERS), 0)
  assertEquals(weaponSfxVolumeMultiplierForDistance(WEAPON_SFX_MAX_DISTANCE_METERS + 1), 0)
})
