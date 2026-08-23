/// <reference lib="deno.ns" />

import { assertEquals, assertThrows } from "jsr:@std/assert"

import {
  parseSfxCredits,
  renderHudSfxCredits,
  renderReadmeSfxCredits,
  replaceGeneratedRegion,
} from "./update-sfx-credits.ts"

const pistolImport =
  `import pistolSfx from "../assets/sfx/828786__areniporgen__glock-19x.ogg" // @sfx-credit {"label":"Pistol","title":"Glock 19X","creator":"areniporgen","id":"828786","license":"CC0","asset":"828786__areniporgen__glock-19x.ogg"}`

Deno.test("SFX credit markers follow their matching SFX imports", () => {
  const credits = parseSfxCredits(pistolImport)

  assertEquals(credits, [{
    label: "Pistol",
    title: "Glock 19X",
    creator: "areniporgen",
    id: "828786",
    license: "CC0",
    asset: "828786__areniporgen__glock-19x.ogg",
  }])
  assertEquals(
    renderReadmeSfxCredits(credits),
    "- Pistol: [Glock 19X by areniporgen](https://freesound.org/s/828786/) - [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)",
  )
  assertEquals(renderHudSfxCredits(credits).includes("Pistol - areniporgen #828786 (CC0)"), true)
  assertEquals(renderHudSfxCredits(credits).includes("{t`"), false)
  assertEquals(parseSfxCredits(pistolImport.replace('.ogg" //', '.ogg"; //')).length, 1)
})

Deno.test("SFX credit output escapes marker text for Markdown and TSX", () => {
  const credit = {
    label: "Bad `${x}",
    title: "Sound [take]",
    creator: "first/last",
    id: "123",
    license: "CC0" as const,
    asset: "sample.ogg",
  }

  assertEquals(renderReadmeSfxCredits([credit]).includes("[Sound \\[take\\] by first/last]"), true)
  assertEquals(
    renderHudSfxCredits([credit]).includes('href="https://freesound.org/people/first%2Flast/sounds/123/"'),
    true,
  )
  assertEquals(renderHudSfxCredits([credit]).includes("Bad `$&#123;x&#125; - first/last #123 (CC0)"), true)
  assertEquals(renderHudSfxCredits([credit]).includes("{t`"), false)
})

Deno.test("SFX imports without a credit marker fail validation", () => {
  assertThrows(
    () => parseSfxCredits('import pistolSfx from "../assets/sfx/828786__areniporgen__glock-19x.ogg"'),
    Error,
    "Missing SFX credit marker",
  )
  assertThrows(
    () => parseSfxCredits("import pistolSfx from '../assets/sfx/828786__areniporgen__glock-19x.ogg'; // TODO"),
    Error,
    "Missing SFX credit marker",
  )
  assertThrows(
    () => parseSfxCredits(" import $pistolSfx from '../assets/sfx/828786__areniporgen__glock-19x.ogg'; // TODO"),
    Error,
    "Missing SFX credit marker",
  )
})

Deno.test("SFX credit markers reject multi-line fields", () => {
  assertThrows(
    () => parseSfxCredits(pistolImport.replace('"label":"Pistol"', '"label":"Pistol\\n- forged credit"')),
    Error,
    "single-line",
  )
})

Deno.test("generated credit regions preserve surrounding content", () => {
  assertEquals(
    replaceGeneratedRegion("before\n<!-- start -->\nold\n<!-- end -->\nafter", "<!-- start -->", "<!-- end -->", "new"),
    "before\n<!-- start -->\nnew\n<!-- end -->\nafter",
  )
})
