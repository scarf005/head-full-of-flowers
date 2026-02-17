/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { decideRenderFxCompositionPlan, recordRenderPathProfileFrame } from "./composition-plan.ts"
import type { RenderPathProfile } from "../world/state.ts"

const createProfile = (): RenderPathProfile => ({
  frames: 0,
  pickupVisibleFrames: 0,
  pickupHiddenFrames: 0,
  obstacleFxWebGlFrames: 0,
  trailWebGlFrames: 0,
  mergedCompositeFrames: 0,
  splitCompositeFrames: 0,
})

Deno.test("decideRenderFxCompositionPlan selects combined composite when pickups are hidden and obstacle fx is rendered", () => {
  const plan = decideRenderFxCompositionPlan(false, true)

  assertEquals(plan.renderObstacleToContext, false)
  assertEquals(plan.runCombinedTrailComposite, true)
  assertEquals(plan.runPostPickupTrailPass, false)
})

Deno.test("decideRenderFxCompositionPlan selects split pass when pickups are visible", () => {
  const plan = decideRenderFxCompositionPlan(true, true)

  assertEquals(plan.renderObstacleToContext, true)
  assertEquals(plan.runCombinedTrailComposite, false)
  assertEquals(plan.runPostPickupTrailPass, true)
})

Deno.test("decideRenderFxCompositionPlan keeps fallback path when pickups are hidden and obstacle fx is not rendered", () => {
  const plan = decideRenderFxCompositionPlan(false, false)

  assertEquals(plan.renderObstacleToContext, false)
  assertEquals(plan.runCombinedTrailComposite, false)
  assertEquals(plan.runPostPickupTrailPass, false)
})

Deno.test("decideRenderFxCompositionPlan still runs split path when pickups are visible and obstacle fx is not rendered", () => {
  const plan = decideRenderFxCompositionPlan(true, false)

  assertEquals(plan.renderObstacleToContext, true)
  assertEquals(plan.runCombinedTrailComposite, false)
  assertEquals(plan.runPostPickupTrailPass, true)
})

Deno.test("recordRenderPathProfileFrame counts merged composite frames", () => {
  const profile = createProfile()
  const plan = decideRenderFxCompositionPlan(false, true)

  recordRenderPathProfileFrame(profile, false, true, true, plan)

  assertEquals(profile.frames, 1)
  assertEquals(profile.pickupHiddenFrames, 1)
  assertEquals(profile.obstacleFxWebGlFrames, 1)
  assertEquals(profile.trailWebGlFrames, 1)
  assertEquals(profile.mergedCompositeFrames, 1)
  assertEquals(profile.splitCompositeFrames, 0)
})

Deno.test("recordRenderPathProfileFrame counts split composite frames", () => {
  const profile = createProfile()
  const plan = decideRenderFxCompositionPlan(true, true)

  recordRenderPathProfileFrame(profile, true, true, true, plan)

  assertEquals(profile.frames, 1)
  assertEquals(profile.pickupVisibleFrames, 1)
  assertEquals(profile.obstacleFxWebGlFrames, 1)
  assertEquals(profile.trailWebGlFrames, 1)
  assertEquals(profile.mergedCompositeFrames, 0)
  assertEquals(profile.splitCompositeFrames, 1)
})

Deno.test("recordRenderPathProfileFrame does not count merged or split composite when trail rendering is skipped", () => {
  const profile = createProfile()
  const plan = decideRenderFxCompositionPlan(false, false)

  recordRenderPathProfileFrame(profile, false, false, false, plan)

  assertEquals(profile.frames, 1)
  assertEquals(profile.pickupHiddenFrames, 1)
  assertEquals(profile.obstacleFxWebGlFrames, 0)
  assertEquals(profile.trailWebGlFrames, 0)
  assertEquals(profile.mergedCompositeFrames, 0)
  assertEquals(profile.splitCompositeFrames, 0)
})
