import { assertEquals } from "jsr:@std/assert"
import { buildOffscreenIndicatorAnchor, isOffscreenIndicatorAnchorInView } from "./offscreen-indicator-visibility.ts"

Deno.test("buildOffscreenIndicatorAnchor applies recoil offset and body extent", () => {
  const anchor = buildOffscreenIndicatorAnchor({
    position: { x: 12, y: -3 },
    aim: { x: 1, y: -0.5 },
    recoil: 1,
    radius: 0.28,
  })

  assertEquals(anchor.x, 11.68)
  assertEquals(anchor.y, -2.84)
  assertEquals(anchor.extent, 0.336)
})

Deno.test("isOffscreenIndicatorAnchorInView returns true when anchor is fully inside viewport", () => {
  const anchor = {
    x: 0,
    y: 0,
    extent: 0.336,
  }

  assertEquals(isOffscreenIndicatorAnchorInView(anchor, 0, 0), true)
})

Deno.test("isOffscreenIndicatorAnchorInView returns false when body is clipped beyond right edge", () => {
  const anchor = {
    x: 12.49,
    y: 0,
    extent: 0.336,
  }

  assertEquals(isOffscreenIndicatorAnchorInView(anchor, 0, 0), false)
})

Deno.test("isOffscreenIndicatorAnchorInView returns false when recoil-shifted draw anchor leaves viewport", () => {
  const anchor = buildOffscreenIndicatorAnchor({
    position: { x: 12.3, y: 0 },
    aim: { x: -1, y: 0 },
    recoil: 1,
    radius: 0.28,
  })

  assertEquals(isOffscreenIndicatorAnchorInView(anchor, 0, 0), false)
})
