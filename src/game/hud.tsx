import {
  coverageSlicesSignal,
  crosshairSignal,
  debugEquipAllRocketLauncherSignal,
  debugGameSpeedSignal,
  debugImpactFeelLevelSignal,
  debugInfiniteHpSignal,
  debugInfiniteReloadSignal,
  debugSkipToMatchEndSignal,
  duoTeamCountSignal,
  effectsVolumeSignal,
  ffaPlayerCountSignal,
  fpsSignal,
  hpSignal,
  languageSignal,
  matchResultSignal,
  menuStartDifficultySignal,
  menuVisibleSignal,
  musicVolumeSignal,
  pausedSignal,
  playerPerksSignal,
  primaryWeaponSlotsSignal,
  renderPathProfileSignal,
  renderPathRatesSignal,
  secondaryModeSignal,
  secondaryWeaponCooldownSignal,
  selectedGameModeSignal,
  squadTeamCountSignal,
  statusMessageSignal,
  tdmTeamSizeSignal,
  timeRemainingSignal,
} from "./signals.ts"
import type { CoverageSlice, WeaponHudIcon } from "./signals.ts"
import type { GameModeId } from "./types.ts"
import { getItemSpritePath } from "./render/pixel-art.ts"
import { DebugPanel, MainMenuPanel, PausePanel } from "./hud-panels.tsx"
import { activateLocale } from "../i18n.ts"
import { t } from "@lingui/core/macro"

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
  const showDebugPanel = true
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
    ? t`Players ${players}`
    : selectedMode === "tdm"
    ? t`Players ${players} (${tdmTeamSize}v${tdmTeamSize})`
    : selectedMode === "duo"
    ? t`Teams ${duoTeams} (${players} total)`
    : t`Teams ${squadTeams} (${players} total)`
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
  const isPaused = pausedSignal.value
  const impactFeelLevel = debugImpactFeelLevelSignal.value
  const impactFeelLabel = impactFeelLevel >= 1.75 ? t`Heavy` : impactFeelLevel <= 1.25 ? t`Medium` : t`Hybrid`
  const secondaryMode = secondaryModeSignal.value
  const secondaryLabel = secondaryMode === "grenade" ? t`Grenade` : t`Molotov`
  const perks = playerPerksSignal.value
  const renderPathProfile = renderPathProfileSignal.value
  const renderPathRates = renderPathRatesSignal.value
  const renderFrames = Math.max(1, renderPathProfile.frames)
  const mergedPercent = (renderPathProfile.mergedCompositeFrames / renderFrames) * 100
  const splitPercent = (renderPathProfile.splitCompositeFrames / renderFrames) * 100
  const locale = languageSignal.value
  const modeCards: { id: GameModeId; label: string; detail: string }[] = [
    { id: "ffa", label: t`Free For All`, detail: t`Every player for themselves` },
    { id: "tdm", label: t`Team Deathmatch`, detail: t`2 teams, even sides` },
    { id: "duo", label: t`Duo`, detail: t`2 players per team` },
    { id: "squad", label: t`Squad`, detail: t`4 players per team` },
  ]

  const onSelectLocale = (nextLocale: "en" | "ko") => {
    activateLocale(nextLocale)
    languageSignal.value = nextLocale
  }

  return (
    <>
      {!showMenu
        ? (
          <div class="hud hud-top">
            <div class="hud-pill">{t`Time ${formatTime(timeRemainingSignal.value)}`}</div>
            {isPaused ? <div class="hud-pill hud-pill-warn">{t`Paused`}</div> : null}
            <div class="score-panel">
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
            <div class="hud-pill hud-pill-fps">{t`FPS ${Math.round(fpsSignal.value)}`}</div>
          </div>
        )
        : null}

      {showDebugPanel && !showMenu
        ? (
          <DebugPanel
            impactFeelLabel={impactFeelLabel}
            impactFeelLevel={impactFeelLevel}
            mergedPercent={mergedPercent}
            splitPercent={splitPercent}
            renderPathProfile={renderPathProfile}
            renderPathRates={renderPathRates}
          />
        )
        : null}

      {showMenu
        ? (
          <MainMenuPanel
            modeCards={modeCards}
            selectedMode={selectedMode}
            sliderLabel={sliderLabel}
            sliderMin={sliderMin}
            sliderMax={sliderMax}
            sliderStep={sliderStep}
            sliderValue={sliderValue}
            locale={locale}
            onSelectLocale={onSelectLocale}
          />
        )
        : null}

      {!showMenu && pausedSignal.value && !result.visible
        ? <PausePanel locale={locale} onSelectLocale={onSelectLocale} />
        : null}

      {!showMenu && statusMessageSignal.value ? <div class="hud status-text">{statusMessageSignal.value}</div> : null}

      {!showMenu
        ? (
          <div class="hud hud-left">
            <div class="weapon-card">
              <div class="weapon-title">{t`Primary`}</div>
              <div class="primary-slot-list">
                {primaryWeaponSlotsSignal.value.map((slot, index) => (
                  <div
                    class={`primary-slot ${slot.selected ? "selected" : "dimmed"}`}
                    key={`${slot.label}-${slot.ammo}-${index}`}
                  >
                    <WeaponIcon icon={slot.icon} fallback={slot.label.slice(0, 2).toUpperCase()} />
                    <div>
                      <div class="weapon-value compact">{slot.label}</div>
                      <div class="weapon-sub">{t`Ammo ${slot.ammo}`}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div class="weapon-card">
              <div class="weapon-title-row">
                <div class="weapon-title">{t`Secondary`}</div>
                <WeaponIcon
                  icon={secondaryMode}
                  fallback={secondaryLabel.slice(0, 2)}
                />
              </div>
              <div class="weapon-value compact">{secondaryLabel}</div>
              <div class="weapon-sub">{secondaryWeaponCooldownSignal.value}</div>
            </div>
            <div class="weapon-card hp-card">
              <div class="weapon-title">{t`HP`}</div>
              <div class="hp-track">
                <div class="hp-fill" style={{ width: `${Math.max(0, Math.min(100, (hp.hp / hp.maxHp) * 100))}%` }} />
              </div>
              <div class="weapon-sub">{hp.hp} / {hp.maxHp}</div>
            </div>
            {perks.length > 0
              ? (
                <div class="weapon-card perks-card">
                  <div class="weapon-title">{t`Perks`}</div>
                  <div class="perk-list">
                    {perks.map((perk) => (
                      <div class="perk-row" key={perk.id}>
                        <WeaponIcon icon={perk.icon} fallback={perk.label.slice(0, 2).toUpperCase()} />
                        <div>
                          <div class="weapon-value compact">{perk.label}</div>
                          <div class="weapon-sub">
                            {perk.stacks > 1 ? `${perk.detail} x${perk.stacks}` : perk.detail}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
              : null}
          </div>
        )
        : null}

      {result.visible
        ? (
          <div class="hud match-result" aria-live="polite">
            <div class="match-result-title">{t`Match Results`}</div>
            <div class="match-result-name" style={{ color: result.winnerColor }}>{result.winnerLabel}</div>
            <div class="match-result-content">
              <div class="match-result-pie" style={{ background: result.pieGradient }} />
              <div class="match-result-standings">
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
            <div class="match-result-stats">
              {result.stats.map((stat) => (
                <div class="match-result-stat" key={stat.label}>
                  <div class="match-result-stat-label">{stat.label}</div>
                  <div class="match-result-stat-value">{stat.value}</div>
                </div>
              ))}
            </div>
            <button type="button" class="match-result-rematch">
              {t`Main Menu`}
            </button>
          </div>
        )
        : null}

      {!showMenu && !result.visible
        ? (
          <div class="hud mobile-controls">
            <div class="mobile-stick-zone mobile-move-zone">
              <div class="mobile-stick-thumb mobile-move-thumb" />
            </div>
            <button type="button" class="mobile-secondary-button">
              {secondaryLabel}
            </button>
            <div class="mobile-stick-zone mobile-aim-zone">
              <div class="mobile-stick-thumb mobile-aim-thumb" />
            </div>
          </div>
        )
        : null}

      {!showMenu && !isPaused
        ? (
          <div
            class={`crosshair ${crosshairSignal.value.visible ? "visible" : ""}`}
            style={{
              transform:
                `translate3d(${crosshairSignal.value.x}px, ${crosshairSignal.value.y}px, 0) translate(-50%, -50%)`,
            }}
          />
        )
        : null}
    </>
  )
}
