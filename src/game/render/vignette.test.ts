/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { computeDamageTakenRatio } from "./vignette.ts"

Deno.test("computeDamageTakenRatio is zero at full health", () => {
  assertEquals(computeDamageTakenRatio(10, 10), 0)
})

Deno.test("computeDamageTakenRatio is zero with partial over-heal", () => {
  assertEquals(computeDamageTakenRatio(12, 10), 0)
})

Deno.test("computeDamageTakenRatio is full at zero hp", () => {
  assertEquals(computeDamageTakenRatio(0, 10), 1)
})

Deno.test("computeDamageTakenRatio reflects half damage taken", () => {
  assertEquals(computeDamageTakenRatio(5, 10), 0.5)
})

Deno.test("computeDamageTakenRatio caps at 1 when hp is below zero", () => {
  assertEquals(computeDamageTakenRatio(-2, 10), 1)
})

Deno.test("computeDamageTakenRatio is zero when maxHp is invalid", () => {
  assertEquals(computeDamageTakenRatio(5, 0), 0)
  assertEquals(computeDamageTakenRatio(5, -3), 0)
})
