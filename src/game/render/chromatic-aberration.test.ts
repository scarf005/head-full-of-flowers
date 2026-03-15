import { assertAlmostEquals, assertEquals } from "jsr:@std/assert"

import {
  screenShakeChromaticAberrationAlpha,
  screenShakeChromaticAberrationPx,
  stepChromaticAberrationShake,
} from "./chromatic-aberration.ts"

Deno.test("screenShakeChromaticAberrationPx returns zero without shake", () => {
  assertEquals(screenShakeChromaticAberrationPx(0), 0)
})

Deno.test("screenShakeChromaticAberrationPx stays off for tiny shake", () => {
  assertEquals(screenShakeChromaticAberrationPx(0.1), 0)
  assertEquals(screenShakeChromaticAberrationPx(0.14), 0)
})

Deno.test("screenShakeChromaticAberrationPx grows after threshold and clamps", () => {
  const lightShift = screenShakeChromaticAberrationPx(0.4)
  const mediumShift = screenShakeChromaticAberrationPx(1.2)
  const heavyShift = screenShakeChromaticAberrationPx(9)

  assertEquals(lightShift > 0, true)
  assertEquals(mediumShift > lightShift, true)
  assertAlmostEquals(heavyShift, 21.21056016505057)
})

Deno.test("screenShakeChromaticAberrationAlpha follows aberration strength", () => {
  assertEquals(screenShakeChromaticAberrationAlpha(0), 0)
  assertEquals(screenShakeChromaticAberrationAlpha(14), 0.71)
  assertEquals(screenShakeChromaticAberrationAlpha(40), 1)
})

Deno.test("stepChromaticAberrationShake caps duration at a quarter second with a longer fade", () => {
  assertEquals(stepChromaticAberrationShake(0.1, 0.4, 0.016, 1), 0.4)
  assertEquals(stepChromaticAberrationShake(0, 9, 0.016, 1), 0.55)
  assertAlmostEquals(stepChromaticAberrationShake(1, 0, 0.1, 1), 0.78)
  assertAlmostEquals(stepChromaticAberrationShake(1, 0, 0.1, 2), 0.34)
})
