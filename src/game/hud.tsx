import {
  debugInfiniteHpSignal,
  debugInfiniteReloadSignal,
  debugSkipToMatchEndSignal,
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
import type { WeaponHudIcon } from "./signals.ts"
import type { CoverageSlice } from "./signals.ts"
import { drawFlameProjectileSprite, drawGrenadeSprite, drawWeaponPickupSprite } from "./render/pixel-art.ts"

type WeaponIconSprite = WeaponHudIcon

const SPRITE_PIXEL_SIZE = 2
const SPRITE_SIZE = 8 * SPRITE_PIXEL_SIZE

const spriteCache = new Map<WeaponIconSprite, string>()

const weaponIconCache = (icon: WeaponIconSprite) => {
  const cached = spriteCache.get(icon)
  if (cached) {
    return cached
  }

  if (typeof document === "undefined") {
    return ""
  }

  const canvas = document.createElement("canvas")
  canvas.width = SPRITE_SIZE
  canvas.height = SPRITE_SIZE
  const context = canvas.getContext("2d")
  if (!context) {
    return ""
  }

  context.imageSmoothingEnabled = false

  const center = SPRITE_SIZE * 0.5

  if (icon === "grenade") {
    drawGrenadeSprite(context, center, center, SPRITE_PIXEL_SIZE)
  } else if (icon === "molotov") {
    drawFlameProjectileSprite(context, center, center, SPRITE_PIXEL_SIZE)
  } else {
    drawWeaponPickupSprite(context, icon, center, center, SPRITE_PIXEL_SIZE)
  }

  const dataUrl = canvas.toDataURL("image/png")
  spriteCache.set(icon, dataUrl)
  return dataUrl
}

const WeaponIcon = ({ icon, fallback }: { icon: WeaponIconSprite; fallback: string }) => {
  const dataUrl = weaponIconCache(icon)
  if (!dataUrl) {
    return <div class="weapon-icon weapon-icon-fallback">{fallback}</div>
  }

  return <img src={dataUrl} class="weapon-icon" alt="" />
}

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
  const showDebugPanel = ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) ?? false

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

      {showDebugPanel ? (
        <div class="hud debug-panel">
          <label class="debug-row">
            <input
              checked={debugInfiniteHpSignal.value}
              type="checkbox"
              onChange={(event) => {
                debugInfiniteHpSignal.value = event.currentTarget.checked
              }}
            />
            <span>Infinite HP</span>
          </label>
          <label class="debug-row">
            <input
              checked={debugInfiniteReloadSignal.value}
              type="checkbox"
              onChange={(event) => {
                debugInfiniteReloadSignal.value = event.currentTarget.checked
              }}
            />
            <span>Infinite Reload</span>
          </label>
          <button
            class="debug-skip"
            type="button"
            onClick={() => {
              debugSkipToMatchEndSignal.value = true
            }}
          >
            Skip to Match End
          </button>
        </div>
      ) : null}

      <div class="hud status-text">{statusMessageSignal.value}</div>

      <div class="hud hud-left">
        <div class="weapon-card">
          <div class="weapon-title-row">
            <div class="weapon-title">Primary</div>
            <WeaponIcon icon={primaryWeaponIconSignal.value} fallback={primaryWeaponSignal.value.slice(0, 2).toUpperCase()} />
          </div>
          <div class="weapon-value compact">{primaryWeaponSignal.value}</div>
          <div class="weapon-sub">Ammo {primaryAmmoSignal.value}</div>
        </div>
        <div class="weapon-card">
          <div class="weapon-title-row">
            <div class="weapon-title">Secondary</div>
            <WeaponIcon
              icon={secondaryWeaponIconSignal.value}
              fallback={secondaryWeaponSignal.value.slice(0, 2)}
            />
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
          <div class="match-result-title">Match Results</div>
          <div class="match-result-name" style={{ color: result.winnerColor }}>{result.winnerLabel}</div>
          <div class="match-result-content">
            <div class="match-result-pie" style={{ background: result.pieGradient }} />
            <div class="match-result-standings" aria-label="Final standings">
              {result.standings.map((standing, index) => (
                <div class="match-result-standing" key={standing.id}>
                  <div class="match-result-standing-main">
                    <span class="match-result-standing-rank">#{index + 1}</span>
                    <i style={{ background: standing.color }} />
                    <span>{standing.label}</span>
                  </div>
                  <div class="match-result-standing-values">
                    <span>{standing.flowers.toLocaleString()}</span>
                    <span>{standing.percent.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div class="match-result-stats" aria-label="Match statistics">
            {result.stats.map((stat) => (
              <div class="match-result-stat" key={stat.label}>
                <div class="match-result-stat-label">{stat.label}</div>
                <div class="match-result-stat-value">{stat.value}</div>
              </div>
            ))}
          </div>
          <button type="button" class="match-result-rematch">
            Play Again
          </button>
        </div>
      ) : null}

      <div
        class={`crosshair ${crosshairSignal.value.visible ? "visible" : ""}`}
        style={{ left: `${crosshairSignal.value.x}px`, top: `${crosshairSignal.value.y}px` }}
      />
    </>
  )
}
