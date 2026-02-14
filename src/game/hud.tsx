import {
  coverageSlicesSignal,
  crosshairSignal,
  debugInfiniteHpSignal,
  debugInfiniteReloadSignal,
  debugSkipToMatchEndSignal,
  duoTeamCountSignal,
  ffaPlayerCountSignal,
  fpsSignal,
  hpSignal,
  matchResultSignal,
  menuVisibleSignal,
  pausedSignal,
  primaryAmmoSignal,
  primaryWeaponIconSignal,
  primaryWeaponSignal,
  secondaryModeSignal,
  secondaryWeaponCooldownSignal,
  selectedGameModeSignal,
  squadTeamCountSignal,
  statusMessageSignal,
  tdmTeamSizeSignal,
  timeRemainingSignal,
} from "./signals.ts"
import type { WeaponHudIcon } from "./signals.ts"
import type { CoverageSlice } from "./signals.ts"
import type { GameModeId } from "./types.ts"
import { getItemSpritePath } from "./render/pixel-art.ts"

type WeaponIconSprite = WeaponHudIcon

const WeaponIcon = ({ icon, fallback }: { icon: WeaponIconSprite; fallback: string }) => {
  const src = getItemSpritePath(icon)
  if (!src) {
    return <div class="weapon-icon weapon-icon-fallback">{fallback}</div>
  }

  return <img src={src} class="weapon-icon" alt="" />
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
  const selectedMode = selectedGameModeSignal.value
  const ffaPlayers = ffaPlayerCountSignal.value
  const tdmTeamSize = tdmTeamSizeSignal.value
  const duoTeams = duoTeamCountSignal.value
  const squadTeams = squadTeamCountSignal.value
  const players = selectedMode === "ffa"
    ? ffaPlayers
    : selectedMode === "tdm"
    ? tdmTeamSize * 2
    : selectedMode === "duo"
    ? duoTeams * 2
    : squadTeams * 4
  const sliderLabel = selectedMode === "ffa"
    ? `Players ${players}`
    : selectedMode === "tdm"
    ? `Players ${players} (${tdmTeamSize}v${tdmTeamSize})`
    : selectedMode === "duo"
    ? `Teams ${duoTeams} (${players} total)`
    : `Teams ${squadTeams} (${players} total)`
  const sliderMin = selectedMode === "ffa" ? 2 : selectedMode === "tdm" ? 4 : 2
  const sliderMax = selectedMode === "ffa" ? 8 : selectedMode === "tdm" ? 12 : selectedMode === "duo" ? 6 : 3
  const sliderStep = selectedMode === "tdm" ? 2 : 1
  const sliderValue = selectedMode === "ffa"
    ? ffaPlayers
    : selectedMode === "tdm"
    ? tdmTeamSize * 2
    : selectedMode === "duo"
    ? duoTeams
    : squadTeams
  const showMenu = menuVisibleSignal.value
  const secondaryMode = secondaryModeSignal.value
  const secondaryLabel = secondaryMode === "grenade" ? "Grenade" : "Molotov"
  const modeCards: { id: GameModeId; label: string; detail: string }[] = [
    { id: "ffa", label: "Free For All", detail: "Every player for themselves" },
    { id: "tdm", label: "Team Deathmatch", detail: "2 teams, even sides" },
    { id: "duo", label: "Duo", detail: "2 players per team" },
    { id: "squad", label: "Squad", detail: "4 players per team" },
  ]

  return (
    <>
      {!showMenu
        ? (
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
        )
        : null}

      {showDebugPanel && !showMenu
        ? (
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
        )
        : null}

      {showMenu
        ? (
          <div class="hud menu-layer">
            <div class="menu-panel">
              <div class="menu-title">Head Full of Flowers</div>
              <div class="menu-subtitle">Pick a mode and step into the garden</div>
              <div class="mode-cards" role="radiogroup" aria-label="Game mode">
                {modeCards.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    class={`mode-card ${selectedMode === mode.id ? "active" : ""}`}
                    aria-pressed={selectedMode === mode.id}
                    onClick={() => {
                      selectedGameModeSignal.value = mode.id
                    }}
                  >
                    <span class="mode-card-title">{mode.label}</span>
                    <span class="mode-card-detail">{mode.detail}</span>
                  </button>
                ))}
              </div>
              <label class="mode-row mode-row-slider">
                <span>{sliderLabel}</span>
                <input
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={sliderStep}
                  value={sliderValue}
                  onInput={(event) => {
                    const next = Number(event.currentTarget.value)
                    const mode = selectedGameModeSignal.value
                    if (mode === "ffa") {
                      ffaPlayerCountSignal.value = next
                      return
                    }

                    if (mode === "tdm") {
                      tdmTeamSizeSignal.value = Math.max(2, Math.round(next / 2))
                      return
                    }

                    if (mode === "duo") {
                      duoTeamCountSignal.value = next
                      return
                    }

                    squadTeamCountSignal.value = next
                  }}
                />
              </label>
              <button type="button" class="menu-start-button">Start Match</button>
            </div>
          </div>
        )
        : null}

      {!showMenu && statusMessageSignal.value ? <div class="hud status-text">{statusMessageSignal.value}</div> : null}

      {!showMenu
        ? (
          <div class="hud hud-left">
            <div class="weapon-card">
              <div class="weapon-title-row">
                <div class="weapon-title">Primary</div>
                <WeaponIcon
                  icon={primaryWeaponIconSignal.value}
                  fallback={primaryWeaponSignal.value.slice(0, 2).toUpperCase()}
                />
              </div>
              <div class="weapon-value compact">{primaryWeaponSignal.value}</div>
              <div class="weapon-sub">Ammo {primaryAmmoSignal.value}</div>
            </div>
            <div class="weapon-card">
              <div class="weapon-title-row">
                <div class="weapon-title">Secondary</div>
                <WeaponIcon
                  icon={secondaryMode}
                  fallback={secondaryLabel.slice(0, 2)}
                />
              </div>
              <div class="weapon-value compact">{secondaryLabel}</div>
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
        )
        : null}

      {result.visible
        ? (
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
              Main Menu
            </button>
          </div>
        )
        : null}

      {!showMenu
        ? (
          <div
            class={`crosshair ${crosshairSignal.value.visible ? "visible" : ""}`}
            style={{ left: `${crosshairSignal.value.x}px`, top: `${crosshairSignal.value.y}px` }}
          />
        )
        : null}
    </>
  )
}
