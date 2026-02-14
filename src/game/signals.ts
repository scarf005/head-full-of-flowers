import { signal } from "@preact/signals"

export interface PerkOption {
  id: string
  name: string
  description: string
}

export const timeRemainingSignal = signal(90)
export const whiteCoverageSignal = signal(50)
export const blueCoverageSignal = signal(50)

export const primaryWeaponSignal = signal("Pistol")
export const primaryAmmoSignal = signal("∞")
export const secondaryWeaponSignal = signal("Grenade")
export const hpSignal = signal({ hp: 100, maxHp: 100 })

export const perkOptionsSignal = signal<PerkOption[]>([])
export const statusMessageSignal = signal("Click to begin")

export const crosshairSignal = signal({ x: 0, y: 0, visible: false })
