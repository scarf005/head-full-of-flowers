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

Deno.test("decideRenderFxCompositionPlan merges obstacle and trail fx when WebGL is available", () => {
  for (const hasVisiblePickupLayer of [false, true]) {
    const plan = decideRenderFxCompositionPlan(hasVisiblePickupLayer, true)

    assertEquals(plan.renderObstacleToContext, false)
    assertEquals(plan.runCombinedTrailComposite, true)
    assertEquals(plan.runPostPickupTrailPass, false)
  }
})

Deno.test("decideRenderFxCompositionPlan keeps the fallback trail ordering without obstacle WebGL", () => {
  const hiddenPlan = decideRenderFxCompositionPlan(false, false)
  assertEquals(hiddenPlan.renderObstacleToContext, false)
  assertEquals(hiddenPlan.runCombinedTrailComposite, false)
  assertEquals(hiddenPlan.runPostPickupTrailPass, false)

  const visiblePlan = decideRenderFxCompositionPlan(true, false)
  assertEquals(visiblePlan.renderObstacleToContext, false)
  assertEquals(visiblePlan.runCombinedTrailComposite, false)
  assertEquals(visiblePlan.runPostPickupTrailPass, true)
})

Deno.test("recordRenderPathProfileFrame counts merged composite frames", () => {
  const profile = createProfile()
  const plan = decideRenderFxCompositionPlan(true, true)

  recordRenderPathProfileFrame(profile, true, true, true, plan)

  assertEquals(profile.frames, 1)
  assertEquals(profile.pickupVisibleFrames, 1)
  assertEquals(profile.obstacleFxWebGlFrames, 1)
  assertEquals(profile.trailWebGlFrames, 1)
  assertEquals(profile.mergedCompositeFrames, 1)
  assertEquals(profile.splitCompositeFrames, 0)
})

Deno.test("recordRenderPathProfileFrame counts fallback composite frames", () => {
  const profile = createProfile()
  const plan = decideRenderFxCompositionPlan(true, false)

  recordRenderPathProfileFrame(profile, true, false, true, plan)

  assertEquals(profile.frames, 1)
  assertEquals(profile.pickupVisibleFrames, 1)
  assertEquals(profile.obstacleFxWebGlFrames, 0)
  assertEquals(profile.trailWebGlFrames, 1)
  assertEquals(profile.mergedCompositeFrames, 0)
  assertEquals(profile.splitCompositeFrames, 1)
})

Deno.test("recordRenderPathProfileFrame does not count composites when trail rendering is skipped", () => {
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
