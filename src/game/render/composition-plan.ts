import type { RenderPathProfile } from "../world/state.ts"

export interface RenderFxCompositionPlan {
  renderObstacleToContext: boolean
  runCombinedTrailComposite: boolean
  runPostPickupTrailPass: boolean
}

export const decideRenderFxCompositionPlan = (
  hasVisiblePickupLayer: boolean,
  renderedObstacleFxWithWebGl: boolean,
): RenderFxCompositionPlan => {
  const runCombinedTrailComposite = !hasVisiblePickupLayer && renderedObstacleFxWithWebGl
  const runPostPickupTrailPass = hasVisiblePickupLayer

  return {
    renderObstacleToContext: hasVisiblePickupLayer,
    runCombinedTrailComposite,
    runPostPickupTrailPass,
  }
}

export const recordRenderPathProfileFrame = (
  profile: RenderPathProfile,
  hasVisiblePickupLayer: boolean,
  renderedObstacleFxWithWebGl: boolean,
  renderedFlightTrailsWithWebGl: boolean,
  compositionPlan: RenderFxCompositionPlan,
) => {
  profile.frames += 1
  if (hasVisiblePickupLayer) {
    profile.pickupVisibleFrames += 1
  } else {
    profile.pickupHiddenFrames += 1
  }

  if (renderedObstacleFxWithWebGl) {
    profile.obstacleFxWebGlFrames += 1
  }
  if (renderedFlightTrailsWithWebGl) {
    profile.trailWebGlFrames += 1
  }

  if (compositionPlan.runCombinedTrailComposite && renderedFlightTrailsWithWebGl) {
    profile.mergedCompositeFrames += 1
    return
  }

  if (compositionPlan.runPostPickupTrailPass && renderedFlightTrailsWithWebGl) {
    profile.splitCompositeFrames += 1
  }
}
