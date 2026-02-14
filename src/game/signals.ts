import { signal } from "@preact/signals"
import { MATCH_DURATION_SECONDS, UNIT_BASE_HP } from "./world/constants.ts"
import type { GameModeId, PrimaryWeaponId, SecondaryMode } from "./types.ts"

export interface CoverageSlice {
  id: string
  label: string
  color: string
  percent: number
}

export interface MatchResultHud {
  visible: boolean
  winnerLabel: string
  winnerColor: string
  pieGradient: string
  stats: { label: string; value: string }[]
  standings: { id: string; label: string; color: string; flowers: number; percent: number }[]
}

export const debugInfiniteHpSignal = signal(false)
export const debugInfiniteReloadSignal = signal(false)
export const debugSkipToMatchEndSignal = signal(false)

export const selectedGameModeSignal = signal<GameModeId>("ffa")
export const ffaPlayerCountSignal = signal(8)
export const tdmTeamSizeSignal = signal(4)
export const duoTeamCountSignal = signal(4)
export const squadTeamCountSignal = signal(2)
export const menuVisibleSignal = signal(true)

export const timeRemainingSignal = signal(MATCH_DURATION_SECONDS)
export const fpsSignal = signal(0)
export const pausedSignal = signal(false)
export const coverageSlicesSignal = signal<CoverageSlice[]>([])
export const matchResultSignal = signal<MatchResultHud>({
  visible: false,
  winnerLabel: "",
  winnerColor: "#f2ffe8",
  pieGradient: "conic-gradient(#f2ffe8 0deg 360deg)",
  stats: [],
  standings: [],
})

export const primaryWeaponSignal = signal("Pistol")
export const primaryWeaponIconSignal = signal<WeaponHudIcon>("pistol")
export const primaryAmmoSignal = signal("∞")
export const secondaryModeSignal = signal<SecondaryMode>("grenade")
export const secondaryWeaponCooldownSignal = signal("RMB to throw")
export const hpSignal = signal({ hp: UNIT_BASE_HP, maxHp: UNIT_BASE_HP })

export const statusMessageSignal = signal("Click to begin")

export const crosshairSignal = signal({ x: 0, y: 0, visible: false })
export type WeaponHudIcon = PrimaryWeaponId | SecondaryMode
