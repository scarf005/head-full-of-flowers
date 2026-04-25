import { assertEquals } from "jsr:@std/assert"

import {
  applyReplayInputFrame,
  createSeededRandom,
  parseReplayJsonl,
  replayFramePlaybackDuration,
  ReplayRecorder,
} from "./replay.ts"
import { createWorldState } from "./world/state.ts"

Deno.test("seeded replay random produces the same sequence", () => {
  const first = createSeededRandom("seed-a")
  const second = createSeededRandom("seed-a")

  assertEquals(
    Array.from({ length: 8 }, () => first()),
    Array.from({ length: 8 }, () => second()),
  )
})

Deno.test("replay recorder exports input JSONL that can be applied", () => {
  const world = createWorldState()
  world.input.keys.add("w")
  world.input.leftDown = true
  world.input.canvasX = 512
  world.input.canvasY = 320
  world.input.primarySwapDirection = 1

  const recorder = new ReplayRecorder()
  recorder.reset({ seed: "seed-a", difficulty: "hard", settings: { mode: "ffa" } })
  recorder.record(0.016, 0.016, world.input)

  const replay = parseReplayJsonl(recorder.exportJsonl())
  assertEquals(replay.meta?.seed, "seed-a")
  assertEquals(replay.inputs.length, 1)

  const target = createWorldState().input
  applyReplayInputFrame(target, replay.inputs[0])

  assertEquals([...target.keys], ["w"])
  assertEquals(target.leftDown, true)
  assertEquals(target.canvasX, 512)
  assertEquals(target.canvasY, 320)
  assertEquals(target.primarySwapDirection, 1)
})

Deno.test("replay playback duration follows recorded gameplay dt", () => {
  const recorder = new ReplayRecorder()
  recorder.reset({ seed: "seed-a", difficulty: "hard", settings: { mode: "ffa" } })
  recorder.record(0.016, 0.0128, createWorldState().input)

  const replay = parseReplayJsonl(recorder.exportJsonl())

  assertEquals(replayFramePlaybackDuration(replay.inputs[0]), 0.0128)
})

Deno.test("replay playback duration falls back to frame dt", () => {
  const recorder = new ReplayRecorder()
  recorder.reset({ seed: "seed-a", difficulty: "hard", settings: { mode: "ffa" } })
  recorder.record(0.016, 0, createWorldState().input)

  const replay = parseReplayJsonl(recorder.exportJsonl())

  assertEquals(replayFramePlaybackDuration(replay.inputs[0]), 0.016)
})
