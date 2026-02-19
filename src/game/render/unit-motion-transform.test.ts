/// <reference lib="deno.ns" />

import { assertAlmostEquals, assertEquals } from "jsr:@std/assert"

import { computeHorizontalSkewX, computeWeaponKickbackDistance } from "./unit-motion-transform.ts"

Deno.test("computeHorizontalSkewX returns zero when horizontal velocity is zero", () => {
  assertEquals(computeHorizontalSkewX(0, 175), 0)
})

Deno.test("computeHorizontalSkewX skews right with positive horizontal speed", () => {
  assertAlmostEquals(computeHorizontalSkewX(87.5, 175), -0.14)
})

Deno.test("computeHorizontalSkewX skews left with negative horizontal speed", () => {
  assertAlmostEquals(computeHorizontalSkewX(-87.5, 175), 0.14)
})

Deno.test("computeHorizontalSkewX clamps skew by max transform", () => {
  assertEquals(computeHorizontalSkewX(9999, 175), -0.28)
  assertEquals(computeHorizontalSkewX(-9999, 175), 0.28)
})

Deno.test("computeHorizontalSkewX falls back to safe speed when max speed is invalid", () => {
  assertAlmostEquals(computeHorizontalSkewX(0.28, Number.NaN), -0.0784)
})

Deno.test("computeWeaponKickbackDistance returns zero with no recoil", () => {
  assertEquals(computeWeaponKickbackDistance(0, 60, 14), 0)
})

Deno.test("computeWeaponKickbackDistance scales by recoil and weapon knockback", () => {
  assertAlmostEquals(computeWeaponKickbackDistance(0.5, 30, 14), 1.33, 0.00001)
})

Deno.test("computeWeaponKickbackDistance clamps recoil and knockback", () => {
  assertAlmostEquals(computeWeaponKickbackDistance(3, 200, 14), 5.32, 0.00001)
})

Deno.test("computeWeaponKickbackDistance returns zero for invalid radius", () => {
  assertEquals(computeWeaponKickbackDistance(1, 60, Number.NaN), 0)
})
