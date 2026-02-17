/// <reference lib="deno.ns" />

import { assertAlmostEquals, assertEquals, assertNotStrictEquals } from "jsr:@std/assert"

import {
  cloneRenderPathProfileSnapshot,
  computeRenderPathWindowRateSnapshot,
  sameRenderPathProfileSnapshot,
  type RenderPathProfileSnapshot,
} from "./render-path-profile-sync.ts"

const createSnapshot = (overrides: Partial<RenderPathProfileSnapshot> = {}): RenderPathProfileSnapshot => {
  return {
    frames: 12,
    pickupVisibleFrames: 5,
    pickupHiddenFrames: 7,
    obstacleFxWebGlFrames: 8,
    trailWebGlFrames: 6,
    mergedCompositeFrames: 3,
    splitCompositeFrames: 4,
    ...overrides,
  }
}

Deno.test("sameRenderPathProfileSnapshot returns true when all fields match", () => {
  const left = createSnapshot()
  const right = createSnapshot()

  assertEquals(sameRenderPathProfileSnapshot(left, right), true)
})

Deno.test("sameRenderPathProfileSnapshot returns false when one field differs", () => {
  const left = createSnapshot()
  const right = createSnapshot({ trailWebGlFrames: left.trailWebGlFrames + 1 })

  assertEquals(sameRenderPathProfileSnapshot(left, right), false)
})

Deno.test("cloneRenderPathProfileSnapshot returns a copied object with identical values", () => {
  const source = createSnapshot()
  const clone = cloneRenderPathProfileSnapshot(source)

  assertEquals(clone, source)
  assertNotStrictEquals(clone, source)
})

Deno.test("computeRenderPathWindowRateSnapshot reports windowed merged/split and pickup ratios", () => {
  const history: RenderPathProfileSnapshot[] = []

  computeRenderPathWindowRateSnapshot(
    history,
    createSnapshot({ frames: 100, pickupVisibleFrames: 60, pickupHiddenFrames: 40, mergedCompositeFrames: 40, splitCompositeFrames: 20 }),
  )

  const rates = computeRenderPathWindowRateSnapshot(
    history,
    createSnapshot({ frames: 130, pickupVisibleFrames: 80, pickupHiddenFrames: 50, mergedCompositeFrames: 55, splitCompositeFrames: 30 }),
  )

  assertEquals(rates.sampleFrames, 30)
  assertAlmostEquals(rates.mergedPercent, 50, 0.001)
  assertAlmostEquals(rates.splitPercent, 33.333, 0.01)
  assertAlmostEquals(rates.pickupVisiblePercent, 66.667, 0.01)
  assertAlmostEquals(rates.pickupHiddenPercent, 33.333, 0.01)
})

Deno.test("computeRenderPathWindowRateSnapshot resets history when frame counter rewinds", () => {
  const history: RenderPathProfileSnapshot[] = []

  computeRenderPathWindowRateSnapshot(history, createSnapshot({ frames: 80 }))
  computeRenderPathWindowRateSnapshot(history, createSnapshot({ frames: 120 }))

  const rates = computeRenderPathWindowRateSnapshot(history, createSnapshot({ frames: 5 }))

  assertEquals(history.length, 1)
  assertEquals(history[0].frames, 5)
  assertEquals(rates.sampleFrames, 0)
  assertEquals(rates.mergedPercent, 0)
  assertEquals(rates.splitPercent, 0)
})
