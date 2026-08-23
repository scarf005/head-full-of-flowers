/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { MINIMUM_AUDIO_PARAM_VALUE, nonZeroAudioParamValue } from "./audio-param.ts"

Deno.test("audio parameter ramp targets stay positive", () => {
  assertEquals(nonZeroAudioParamValue(0), MINIMUM_AUDIO_PARAM_VALUE)
  assertEquals(nonZeroAudioParamValue(-1), MINIMUM_AUDIO_PARAM_VALUE)
  assertEquals(nonZeroAudioParamValue(0.42), 0.42)
})
