/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { hasVisiblePickupsInCullBounds, type PickupVisibilityEntry } from "./pickup-visibility.ts"

const cullBounds = {
  minX: -5,
  maxX: 5,
  minY: -4,
  maxY: 4,
}

const createPickup = (
  x: number,
  y: number,
  options: Partial<PickupVisibilityEntry> = {},
): PickupVisibilityEntry => {
  return {
    active: options.active ?? true,
    radius: options.radius ?? 0.6,
    position: options.position ?? { x, y },
  }
}

Deno.test("hasVisiblePickupsInCullBounds returns false when all pickups are inactive", () => {
  const pickups: PickupVisibilityEntry[] = [
    createPickup(0, 0, { active: false }),
    createPickup(4, 1, { active: false }),
  ]

  assertEquals(hasVisiblePickupsInCullBounds(pickups, cullBounds), false)
})

Deno.test("hasVisiblePickupsInCullBounds returns true when an active pickup is inside cull bounds", () => {
  const pickups: PickupVisibilityEntry[] = [
    createPickup(8, 8),
    createPickup(1, -2),
  ]

  assertEquals(hasVisiblePickupsInCullBounds(pickups, cullBounds), true)
})

Deno.test("hasVisiblePickupsInCullBounds returns true when pickup is within radius-plus-padding edge", () => {
  const pickups: PickupVisibilityEntry[] = [
    createPickup(6.25, 0, { radius: 0.9 }),
  ]

  assertEquals(hasVisiblePickupsInCullBounds(pickups, cullBounds), true)
})

Deno.test("hasVisiblePickupsInCullBounds returns false when active pickups are fully outside cull bounds", () => {
  const pickups: PickupVisibilityEntry[] = [
    createPickup(6.7, 0, { radius: 0.9 }),
    createPickup(-7.2, -5.4, { radius: 0.4 }),
  ]

  assertEquals(hasVisiblePickupsInCullBounds(pickups, cullBounds), false)
})
