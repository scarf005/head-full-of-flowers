import { assertEquals } from "jsr:@std/assert"

import { countCountdownTicks } from "./countdown-ticks.ts"

Deno.test("countdown ticks begin at 60 seconds remaining", () => {
  assertEquals(countCountdownTicks(60.1, 59.9), 1)
  assertEquals(countCountdownTicks(59.9, 59.1), 0)
})

Deno.test("countdown tick rate increases at 30, 20, and 10 seconds remaining", () => {
  assertEquals(countCountdownTicks(60, 30), 30)
  assertEquals(countCountdownTicks(30, 20), 14)
  assertEquals(countCountdownTicks(20, 10), 20)
  assertEquals(countCountdownTicks(10, 0), 40)
})

Deno.test("countdown does not tick at match end", () => {
  assertEquals(countCountdownTicks(0.1, 0), 0)
})
