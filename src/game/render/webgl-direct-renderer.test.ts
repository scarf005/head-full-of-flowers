/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"
import { measureDirectWebGLText } from "./webgl-direct-text.ts"

Deno.test("direct WebGL text reserves five pixels for the metre glyph", () => {
  assertEquals(measureDirectWebGLText("m", 2), { width: 10, height: 10 })
  assertEquals(measureDirectWebGLText("12.3m", 2), { width: 42, height: 10 })
})
