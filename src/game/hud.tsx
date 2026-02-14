import {
  coverageSlicesSignal,
  crosshairSignal,
  fpsSignal,
  hpSignal,
  matchResultSignal,
  pausedSignal,
  primaryAmmoSignal,
  primaryWeaponIconSignal,
  primaryWeaponSignal,
  secondaryWeaponIconSignal,
  secondaryWeaponSignal,
  secondaryWeaponCooldownSignal,
  statusMessageSignal,
  timeRemainingSignal
} from "./signals.ts"
import type { CoverageSlice } from "./signals.ts"

const formatTime = (seconds: number) => {
  const rounded = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(rounded / 60)
  const rest = rounded % 60
  return `${minutes}:${rest.toString().padStart(2, "0")}`
}

export const GameHud = () => {
  const hp = hpSignal.value
  const slices: CoverageSlice[] = coverageSlicesSignal.value
  const result = matchResultSignal.value

  return (
    <>
      <div class="hud hud-top">
        <div class="hud-pill">Time {formatTime(timeRemainingSignal.value)}</div>
        {pausedSignal.value ? <div class="hud-pill hud-pill-warn">Paused</div> : null}
        <div class="score-panel" aria-label="Coverage score">
          <div class="score-track score-track-ffa">
            {slices.map((slice) => (
              <div
                key={slice.id}
                class="score-slice"
                style={{ width: `${slice.percent}%`, background: slice.color }}
                title={`${slice.label} ${slice.percent.toFixed(1)}%`}
              />
            ))}
          </div>
          <div class="score-meta score-meta-ffa">
            {slices.map((slice) => (
              <span key={`${slice.id}-label`}>
                <i style={{ background: slice.color }} />
                {slice.label} {slice.percent.toFixed(1)}%
              </span>
            ))}
          </div>
        </div>
        <div class="hud-pill hud-pill-fps">FPS {Math.round(fpsSignal.value)}</div>
      </div>

      <div class="hud status-text">{statusMessageSignal.value}</div>

      <div class="hud hud-left">
        <div class="weapon-card">
          <div class="weapon-title-row">
            <div class="weapon-title">Primary</div>
            <div class="weapon-icon">{primaryWeaponIconSignal.value}</div>
          </div>
          <div class="weapon-value compact">{primaryWeaponSignal.value}</div>
          <div class="weapon-sub">Ammo {primaryAmmoSignal.value}</div>
        </div>
        <div class="weapon-card">
          <div class="weapon-title-row">
            <div class="weapon-title">Secondary</div>
            <div class="weapon-icon">{secondaryWeaponIconSignal.value}</div>
          </div>
          <div class="weapon-value compact">{secondaryWeaponSignal.value}</div>
          <div class="weapon-sub">{secondaryWeaponCooldownSignal.value}</div>
        </div>
        <div class="weapon-card hp-card">
          <div class="weapon-title">HP</div>
          <div class="hp-track">
            <div class="hp-fill" style={{ width: `${Math.max(0, Math.min(100, (hp.hp / hp.maxHp) * 100))}%` }} />
          </div>
          <div class="weapon-sub">{hp.hp} / {hp.maxHp}</div>
        </div>
      </div>

      {result.visible ? (
        <div class="hud match-result" role="status" aria-live="polite">
          <div class="match-result-title">Winner</div>
          <div class="match-result-name" style={{ color: result.winnerColor }}>{result.winnerLabel}</div>
          <div class="match-result-pie" style={{ background: result.pieGradient }} />
        </div>
      ) : null}

      <div
        class={`crosshair ${crosshairSignal.value.visible ? "visible" : ""}`}
        style={{ left: `${crosshairSignal.value.x}px`, top: `${crosshairSignal.value.y}px` }}
      />
    </>
  )
}
