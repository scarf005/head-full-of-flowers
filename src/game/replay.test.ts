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

Deno.test("replay recorder preserves JSONL v3 frame behavior", () => {
  const input = createWorldState().input
  input.keys.add("z")
  input.keys.add("a")
  input.leftDown = true
  input.moveAxisX = -0.5
  input.moveAxisY = 0.25
  input.canvasX = 123
  input.canvasY = 456
  input.primarySwapDirection = -1

  const recorder = new ReplayRecorder()
  recorder.reset({ seed: "seed-a", difficulty: "hard", settings: { mode: "ffa" } })
  recorder.record(0.016, 0.012, input)
  recorder.record(0.017, 0.013, input)

  const lines = recorder.exportJsonl().split("\n")
  const meta = JSON.parse(lines[0])
  const first = JSON.parse(lines[1])
  const second = JSON.parse(lines[2])

  assertEquals(meta.type, "meta")
  assertEquals(meta.version, 3)
  assertEquals(meta.seed, "seed-a")
  assertEquals(first.frame, 0)
  assertEquals(second.frame, 1)
  assertEquals(first.frameDt, 0.016)
  assertEquals(first.gameplayDt, 0.012)
  assertEquals(first.input.keys, ["a", "z"])
  assertEquals(first.input.leftDown, true)
  assertEquals(first.input.moveAxisX, -0.5)
  assertEquals(first.input.moveAxisY, 0.25)
  assertEquals(first.input.canvasX, 123)
  assertEquals(first.input.canvasY, 456)
  assertEquals(first.input.primarySwapDirection, -1)

  recorder.reset({ seed: "seed-b", difficulty: "easy", settings: {} })
  const resetReplay = parseReplayJsonl(recorder.exportJsonl())
  assertEquals(resetReplay.meta?.seed, "seed-b")
  assertEquals(resetReplay.inputs.length, 0)
})
