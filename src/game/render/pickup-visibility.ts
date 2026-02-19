import { type CullBounds, isInsideCullBounds } from "../cull.ts"

export interface PickupVisibilityEntry {
  active: boolean
  radius: number
  position: {
    x: number
    y: number
  }
}

const PICKUP_VISIBILITY_PADDING = 0.5

export const hasVisiblePickupsInCullBounds = (
  pickups: readonly PickupVisibilityEntry[],
  cullBounds: CullBounds,
) => {
  for (const pickup of pickups) {
    if (!pickup.active) {
      continue
    }

    if (
      isInsideCullBounds(pickup.position.x, pickup.position.y, cullBounds, pickup.radius + PICKUP_VISIBILITY_PADDING)
    ) {
      return true
    }
  }

  return false
}
