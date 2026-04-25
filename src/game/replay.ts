import type { MatchDifficulty } from "./types.ts"
import type { InputState } from "./world/state.ts"

export interface ReplayInputFrame {
  type: "input"
  frame: number
  frameDt: number
  gameplayDt: number
  input: {
    keys: string[]
    leftDown: boolean
    rightDown: boolean
    moveAxisX: number
    moveAxisY: number
    canvasX: number
    canvasY: number
    primarySwapDirection: number
  }
}

export interface ParsedReplay {
  meta: ReplayMeta | null
  inputs: ReplayInputFrame[]
}

export interface ReplayMeta {
  type: "meta"
  version: 1
  seed: string
  difficulty: MatchDifficulty
  settings: Record<string, unknown>
  createdAt: string
}

export type RandomSource = () => number

let currentRandomSource: RandomSource = () => Math.random()

export const randomFloat = () => currentRandomSource()

export const withRandomSource = <T>(source: RandomSource, action: () => T): T => {
  const previous = currentRandomSource
  currentRandomSource = source
  try {
    return action()
  } finally {
    currentRandomSource = previous
  }
}

const hashSeed = (seed: string) => {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export const createSeededRandom = (seed: string): RandomSource => {
  let state = hashSeed(seed) || 0x9e3779b9
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export const createReplaySeed = () => {
  const bytes = new Uint32Array(2)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    bytes[0] = Math.floor(Math.random() * 0xffffffff)
    bytes[1] = Date.now() >>> 0
  }
  return `${bytes[0].toString(36)}-${bytes[1].toString(36)}`
}

export class ReplayRecorder {
  private seed = ""
  private difficulty: MatchDifficulty = "hard"
  private frame = 0
  private lines: string[] = []

  reset(options: { seed: string; difficulty: MatchDifficulty; settings: Record<string, unknown> }) {
    this.seed = options.seed
    this.difficulty = options.difficulty
    this.frame = 0
    const meta: ReplayMeta = {
      type: "meta",
      version: 1,
      seed: this.seed,
      difficulty: this.difficulty,
      settings: options.settings,
      createdAt: new Date().toISOString(),
    }
    this.lines = [JSON.stringify(meta)]
  }

  record(frameDt: number, gameplayDt: number, input: InputState) {
    if (!this.seed) {
      return
    }

    const frame: ReplayInputFrame = {
      type: "input",
      frame: this.frame,
      frameDt,
      gameplayDt,
      input: {
        keys: [...input.keys].sort(),
        leftDown: input.leftDown,
        rightDown: input.rightDown,
        moveAxisX: input.moveAxisX,
        moveAxisY: input.moveAxisY,
        canvasX: input.canvasX,
        canvasY: input.canvasY,
        primarySwapDirection: input.primarySwapDirection,
      },
    }
    this.lines.push(JSON.stringify(frame))
    this.frame += 1
  }

  exportJsonl() {
    return this.lines.join("\n")
  }
}

export const applyReplayInputFrame = (target: InputState, frame: ReplayInputFrame) => {
  target.keys.clear()
  for (const key of frame.input.keys) {
    target.keys.add(key)
  }
  target.leftDown = frame.input.leftDown
  target.rightDown = frame.input.rightDown
  target.moveAxisX = frame.input.moveAxisX
  target.moveAxisY = frame.input.moveAxisY
  target.canvasX = frame.input.canvasX
  target.canvasY = frame.input.canvasY
  target.primarySwapDirection = frame.input.primarySwapDirection
}

export const parseReplayJsonl = (jsonl: string): ParsedReplay => {
  const parsed: ParsedReplay = { meta: null, inputs: [] }
  for (const line of jsonl.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const entry = JSON.parse(trimmed) as ReplayMeta | ReplayInputFrame
    if (entry.type === "meta") {
      parsed.meta = entry
    } else if (entry.type === "input") {
      parsed.inputs.push(entry)
    }
  }
  return parsed
}

let replayExportProvider: (() => string | null) | null = null
let replayLoadProvider: ((jsonl: string) => Promise<boolean>) | null = null

export const registerReplayExportProvider = (provider: (() => string | null) | null) => {
  replayExportProvider = provider
}

export const registerReplayLoadProvider = (provider: ((jsonl: string) => Promise<boolean>) | null) => {
  replayLoadProvider = provider
}

const writeTextToClipboard = async (text: string) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (error) {
      console.error("Failed to write replay via navigator clipboard", error)
    }
  }

  if (typeof document === "undefined") {
    return false
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.left = "-10000px"
  textarea.style.top = "-10000px"
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  try {
    const copied = document.execCommand("copy")
    document.body.removeChild(textarea)
    return copied
  } catch (error) {
    console.error("Failed to write replay via execCommand", error)
    document.body.removeChild(textarea)
    return false
  }
}

export const copyReplayToClipboard = async () => {
  const replay = replayExportProvider?.()
  if (!replay) {
    return false
  }
  return await writeTextToClipboard(replay)
}

export const loadReplayFromClipboard = async () => {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText || !replayLoadProvider) {
    return false
  }

  try {
    const jsonl = await navigator.clipboard.readText()
    return await replayLoadProvider(jsonl)
  } catch (error) {
    console.error("Failed to load replay from clipboard", error)
    return false
  }
}

export const loadReplayJsonlText = async (jsonl: string) => {
  if (!replayLoadProvider) {
    return false
  }

  try {
    return await replayLoadProvider(jsonl)
  } catch (error) {
    console.error("Failed to load replay text", error)
    return false
  }
}
