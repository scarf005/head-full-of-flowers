/// <reference lib="deno.ns" />

import { assertSnapshot } from "jsr:@std/testing/snapshot"

import { arenaRadiiForPlayerCount } from "./utils.ts"

const SNAPSHOT_PLAYER_COUNTS = [2, 5, 8, 12] as const

Deno.test("arenaRadiiForPlayerCount snapshot", async (t) => {
  const radiiByPlayerCount = SNAPSHOT_PLAYER_COUNTS.map((playerCount) => ({
    playerCount,
    ...arenaRadiiForPlayerCount(playerCount),
  }))

  await assertSnapshot(t, radiiByPlayerCount)
})
