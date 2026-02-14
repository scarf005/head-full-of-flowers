import { signal } from "@preact/signals"
import { MATCH_DURATION_SECONDS, UNIT_BASE_HP } from "./world/constants.ts"

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
}

export const timeRemainingSignal = signal(MATCH_DURATION_SECONDS)
export const fpsSignal = signal(0)
export const pausedSignal = signal(false)
export const coverageSlicesSignal = signal<CoverageSlice[]>([])
export const matchResultSignal = signal<MatchResultHud>({
  visible: false,
  winnerLabel: "",
  winnerColor: "#f2ffe8",
  pieGradient: "conic-gradient(#f2ffe8 0deg 360deg)"
})

export const primaryWeaponSignal = signal("Pistol")
export const primaryWeaponIconSignal = signal("P")
export const primaryAmmoSignal = signal("∞")
export const secondaryWeaponSignal = signal("Grenade")
export const secondaryWeaponIconSignal = signal("G")
export const secondaryWeaponCooldownSignal = signal("RMB to throw")
export const hpSignal = signal({ hp: UNIT_BASE_HP, maxHp: UNIT_BASE_HP })

export const statusMessageSignal = signal("Click to begin")

export const crosshairSignal = signal({ x: 0, y: 0, visible: false })
