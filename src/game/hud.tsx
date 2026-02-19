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
  persistAudioOptions,
  persistDebugOptions,
  persistGameModeOptions,
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
import { MATCH_DURATION_SECONDS } from "./world/constants.ts"
import { activateLocale } from "../i18n.ts"
import { copyDebugWorldStateToClipboard } from "./debug-state-copy.ts"
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
            {pausedSignal.value ? <div class="hud-pill hud-pill-warn">{t`Paused`}</div> : null}
            <div class="score-panel" aria-label={t`Coverage score`}>
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
          <div class="hud debug-panel">
            <label class="debug-row">
              <input
                checked={debugInfiniteHpSignal.value}
                type="checkbox"
                onChange={(event) => {
                  debugInfiniteHpSignal.value = event.currentTarget.checked
                  persistDebugOptions()
                }}
              />
              <span>{t`Infinite HP`}</span>
            </label>
            <label class="debug-row">
              <input
                checked={debugInfiniteReloadSignal.value}
                type="checkbox"
                onChange={(event) => {
                  debugInfiniteReloadSignal.value = event.currentTarget.checked
                  persistDebugOptions()
                }}
              />
              <span>{t`Infinite Reload`}</span>
            </label>
            <label class="debug-row">
              <input
                checked={debugEquipAllRocketLauncherSignal.value}
                type="checkbox"
                onChange={(event) => {
                  debugEquipAllRocketLauncherSignal.value = event.currentTarget.checked
                  persistDebugOptions()
                }}
              />
              <span>{t`Equip all with rocket launcher`}</span>
            </label>
            <label class="debug-speed">
              <span>{t`Game Speed ${debugGameSpeedSignal.value.toFixed(2)}x`}</span>
              <input
                type="range"
                min={40}
                max={150}
                step={5}
                value={Math.round(debugGameSpeedSignal.value * 100)}
                onInput={(event) => {
                  debugGameSpeedSignal.value = Number(event.currentTarget.value) / 100
                  persistDebugOptions()
                }}
              />
            </label>
            <label class="debug-speed">
              <span>{t`Impact Feel ${impactFeelLabel} (${impactFeelLevel.toFixed(2)}x)`}</span>
              <input
                type="range"
                min={1}
                max={2}
                step={0.05}
                value={impactFeelLevel}
                onInput={(event) => {
                  debugImpactFeelLevelSignal.value = Number(event.currentTarget.value)
                  persistDebugOptions()
                }}
              />
            </label>
            <button
              class="debug-skip"
              type="button"
              onClick={() => {
                debugSkipToMatchEndSignal.value = true
              }}
            >
              {t`Skip to Match End`}
            </button>
            <button
              class="debug-skip"
              type="button"
              onClick={() => {
                void copyDebugWorldStateToClipboard().then((copied) => {
                  statusMessageSignal.value = copied ? t`Copied state to clipboard` : t`Failed to copy state`
                })
              }}
            >
              {t`Copy state to clipboard`}
            </button>
            <div class="debug-speed">
              <span>{t`Render Profile ${renderPathProfile.frames} frames`}</span>
              <span>
                {t`Pickups ${renderPathProfile.pickupVisibleFrames} visible / ${renderPathProfile.pickupHiddenFrames} hidden`}
              </span>
              <span>
                {t`WebGL ${renderPathProfile.obstacleFxWebGlFrames} obstacle fx / ${renderPathProfile.trailWebGlFrames} trails`}
              </span>
              <span>
                {t`Composite ${renderPathProfile.mergedCompositeFrames} merged (${
                  mergedPercent.toFixed(1)
                }%) / ${renderPathProfile.splitCompositeFrames} split (${splitPercent.toFixed(1)}%)`}
              </span>
              <span>
                {t`Window ${renderPathRates.sampleFrames} f: merged ${
                  renderPathRates.mergedPercent.toFixed(1)
                }% / split ${renderPathRates.splitPercent.toFixed(1)}%`}
              </span>
              <span>
                {t`Window pickups ${renderPathRates.pickupVisiblePercent.toFixed(1)}% visible / ${
                  renderPathRates.pickupHiddenPercent.toFixed(1)
                }% hidden`}
              </span>
            </div>
          </div>
        )
        : null}

      {showMenu
        ? (
          <div class="hud menu-layer">
            <div class="menu-panel">
              <div class="menu-subtitle">
                {t`Bada² and the`}
              </div>
              <div class="menu-title">{t`Head Full of Flowers`}</div>
              <div class="menu-subtitle">
                {t`the player with the biggest flower patch for ${MATCH_DURATION_SECONDS} seconds wins the match`}
              </div>
              <div class="menu-subtitle">
                {t`wasd: move, mouse: aim and shoot, LMB: primary, RMB: secondary, wheel: swap primary`}
              </div>
              <div class="mode-cards" role="radiogroup" aria-label={t`Game mode`}>
                {modeCards.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    class={`mode-card ${selectedMode === mode.id ? "active" : ""}`}
                    aria-pressed={selectedMode === mode.id}
                    onClick={() => {
                      selectedGameModeSignal.value = mode.id
                      persistGameModeOptions()
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
                      persistGameModeOptions()
                      return
                    }

                    if (mode === "tdm") {
                      tdmTeamSizeSignal.value = Math.max(2, Math.round(next / 2))
                      persistGameModeOptions()
                      return
                    }

                    if (mode === "duo") {
                      duoTeamCountSignal.value = next
                      persistGameModeOptions()
                      return
                    }

                    squadTeamCountSignal.value = next
                    persistGameModeOptions()
                  }}
                />
              </label>
              <div class="mode-row">
                <span>{t`Language`}</span>
                <div class="option-language-row">
                  <button
                    type="button"
                    class={`option-language-button ${locale === "en" ? "active" : ""}`}
                    onClick={() => {
                      onSelectLocale("en")
                    }}
                  >
                    {t`English`}
                  </button>
                  <button
                    type="button"
                    class={`option-language-button ${locale === "ko" ? "active" : ""}`}
                    onClick={() => {
                      onSelectLocale("ko")
                    }}
                  >
                    {t`Korean`}
                  </button>
                </div>
              </div>
              <div class="menu-start-actions">
                <button
                  type="button"
                  class="menu-start-button menu-start-easy"
                  data-difficulty="easy"
                  onClick={() => {
                    menuStartDifficultySignal.value = "easy"
                  }}
                >
                  {t`Easy Mode`}
                </button>
                <button
                  type="button"
                  class="menu-start-button menu-start-hard"
                  data-difficulty="hard"
                  onClick={() => {
                    menuStartDifficultySignal.value = "hard"
                  }}
                >
                  {t`Hard Mode`}
                </button>
              </div>
            </div>
          </div>
        )
        : null}

      {!showMenu && pausedSignal.value && !result.visible
        ? (
          <div class="hud pause-layer">
            <div class="pause-panel">
              <div class="pause-title">{t`Paused`}</div>
              <div class="pause-hint">{t`Match is frozen. Adjust options or resume.`}</div>
              <label class="mode-row mode-row-slider">
                <span>{t`Music Volume ${Math.round(musicVolumeSignal.value * 100)}%`}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(musicVolumeSignal.value * 100)}
                  onInput={(event) => {
                    musicVolumeSignal.value = Number(event.currentTarget.value) / 100
                    persistAudioOptions()
                  }}
                />
              </label>
              <label class="mode-row mode-row-slider">
                <span>{t`Effects Volume ${Math.round(effectsVolumeSignal.value * 100)}%`}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(effectsVolumeSignal.value * 100)}
                  onInput={(event) => {
                    effectsVolumeSignal.value = Number(event.currentTarget.value) / 100
                    persistAudioOptions()
                  }}
                />
              </label>
              <div class="mode-row">
                <span>{t`Language`}</span>
                <div class="option-language-row">
                  <button
                    type="button"
                    class={`option-language-button ${locale === "en" ? "active" : ""}`}
                    onClick={() => {
                      onSelectLocale("en")
                    }}
                  >
                    {t`English`}
                  </button>
                  <button
                    type="button"
                    class={`option-language-button ${locale === "ko" ? "active" : ""}`}
                    onClick={() => {
                      onSelectLocale("ko")
                    }}
                  >
                    {t`Korean`}
                  </button>
                </div>
              </div>
              <div class="pause-actions">
                <button type="button" class="pause-resume-button">{t`Resume`}</button>
                <button type="button" class="pause-main-menu-button">{t`Main Menu`}</button>
              </div>
            </div>
          </div>
        )
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
          <div class="hud match-result" role="status" aria-live="polite">
            <div class="match-result-title">{t`Match Results`}</div>
            <div class="match-result-name" style={{ color: result.winnerColor }}>{result.winnerLabel}</div>
            <div class="match-result-content">
              <div class="match-result-pie" style={{ background: result.pieGradient }} />
              <div class="match-result-standings" aria-label={t`Final standings`}>
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
            <div class="match-result-stats" aria-label={t`Match statistics`}>
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
          <div class="hud mobile-controls" aria-label={t`Mobile controls`}>
            <div class="mobile-stick-zone mobile-move-zone" aria-label={t`Move joystick`}>
              <div class="mobile-stick-thumb mobile-move-thumb" />
            </div>
            <button type="button" class="mobile-secondary-button" aria-label={t`Throw ${secondaryLabel}`}>
              {secondaryLabel}
            </button>
            <div class="mobile-stick-zone mobile-aim-zone" aria-label={t`Aim and fire joystick`}>
              <div class="mobile-stick-thumb mobile-aim-thumb" />
            </div>
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
