import {
  blueCoverageSignal,
  crosshairSignal,
  hpSignal,
  perkOptionsSignal,
  primaryAmmoSignal,
  primaryWeaponSignal,
  secondaryWeaponSignal,
  statusMessageSignal,
  timeRemainingSignal,
  whiteCoverageSignal
} from "./signals.ts"

const formatTime = (seconds: number) => {
  const rounded = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(rounded / 60)
  const rest = rounded % 60
  return `${minutes}:${rest.toString().padStart(2, "0")}`
}

export const GameHud = () => {
  const perkChoices = perkOptionsSignal.value
  const hp = hpSignal.value

  return (
    <>
      <div class="hud hud-top">
        <div class="hud-pill">Time {formatTime(timeRemainingSignal.value)}</div>
        <div class="score-panel" aria-label="Coverage score">
          <div class="score-track">
            <div class="score-white" style={{ width: `${whiteCoverageSignal.value}%` }} />
            <div class="score-blue" style={{ width: `${blueCoverageSignal.value}%` }} />
          </div>
          <div class="score-meta">
            <span>White {whiteCoverageSignal.value.toFixed(1)}%</span>
            <span>Blue {blueCoverageSignal.value.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <div class="hud status-text">{statusMessageSignal.value}</div>

      <div class="hud hud-left">
        <div class="weapon-card">
          <div class="weapon-title">Primary</div>
          <div class="weapon-value">{primaryWeaponSignal.value}</div>
          <div class="weapon-sub">Ammo {primaryAmmoSignal.value}</div>
        </div>
        <div class="weapon-card">
          <div class="weapon-title">Secondary</div>
          <div class="weapon-value">{secondaryWeaponSignal.value}</div>
          <div class="weapon-sub">RMB to throw</div>
        </div>
        <div class="weapon-card hp-card">
          <div class="weapon-title">HP</div>
          <div class="hp-track">
            <div class="hp-fill" style={{ width: `${Math.max(0, Math.min(100, (hp.hp / hp.maxHp) * 100))}%` }} />
          </div>
          <div class="weapon-sub">{hp.hp} / {hp.maxHp}</div>
        </div>
      </div>

      {perkChoices.length > 0 ? (
        <div class="hud perk-overlay">
          <span>Press 1: {perkChoices[0]?.name}</span>
          <span>Press 2: {perkChoices[1]?.name}</span>
          <span>Press 3: {perkChoices[2]?.name}</span>
        </div>
      ) : null}

      <div
        class={`crosshair ${crosshairSignal.value.visible ? "visible" : ""}`}
        style={{ left: `${crosshairSignal.value.x}px`, top: `${crosshairSignal.value.y}px` }}
      />
    </>
  )
}
