import { assertEquals } from "jsr:@std/assert"

import { shouldRefreshMinimapComposite } from "./minimap-refresh.ts"

const baseState = {
  hasCanvas: true,
  hasContext: true,
  mapChanged: false,
  pixelSizeChanged: false,
  arenaChanged: false,
  refreshDue: false,
}

Deno.test("minimap composite refreshes for each existing invalidation source", () => {
  assertEquals(shouldRefreshMinimapComposite(baseState), false)
  assertEquals(shouldRefreshMinimapComposite({ ...baseState, hasCanvas: false }), true)
  assertEquals(shouldRefreshMinimapComposite({ ...baseState, hasContext: false }), true)
  assertEquals(shouldRefreshMinimapComposite({ ...baseState, mapChanged: true }), true)
  assertEquals(shouldRefreshMinimapComposite({ ...baseState, pixelSizeChanged: true }), true)
  assertEquals(shouldRefreshMinimapComposite({ ...baseState, arenaChanged: true }), true)
  assertEquals(shouldRefreshMinimapComposite({ ...baseState, refreshDue: true }), true)
})

Deno.test("flower dirtiness alone does not bypass the minimap refresh interval", () => {
  assertEquals(shouldRefreshMinimapComposite(baseState), false)
  assertEquals(shouldRefreshMinimapComposite({ ...baseState, refreshDue: true }), true)
})
