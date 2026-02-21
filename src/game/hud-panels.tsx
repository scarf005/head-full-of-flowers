import {
  debugEquipAllRocketLauncherSignal,
  debugGameSpeedSignal,
  debugImpactFeelLevelSignal,
  debugInfiniteHpSignal,
  debugInfiniteReloadSignal,
  debugSkipToMatchEndSignal,
  duoTeamCountSignal,
  effectsVolumeSignal,
  ffaPlayerCountSignal,
  menuStartDifficultySignal,
  musicVolumeSignal,
  selectedGameModeSignal,
  squadTeamCountSignal,
  statusMessageSignal,
  tdmTeamSizeSignal,
} from "./signals.ts"
import type { RenderPathProfileHud, RenderPathRatesHud } from "./signals.ts"
import type { GameModeId } from "./types.ts"
import { copyDebugWorldStateToClipboard } from "./debug-state-copy.ts"
import { MATCH_DURATION_SECONDS } from "./world/constants.ts"
import { t } from "@lingui/core/macro"

interface DebugPanelProps {
  impactFeelLabel: string
  impactFeelLevel: number
  mergedPercent: number
  splitPercent: number
  renderPathProfile: RenderPathProfileHud
  renderPathRates: RenderPathRatesHud
}

export const DebugPanel = ({
  impactFeelLabel,
  impactFeelLevel,
  mergedPercent,
  splitPercent,
  renderPathProfile,
  renderPathRates,
}: DebugPanelProps) => {
  return (
    <div class="hud debug-panel">
      <label class="debug-row">
        <input
          checked={debugInfiniteHpSignal.value}
          type="checkbox"
          onChange={(event) => {
            debugInfiniteHpSignal.value = event.currentTarget.checked
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
          }% / split ${renderPathRates.splitPercent}%`}
        </span>
        <span>
          {t`Window pickups ${
            renderPathRates.pickupVisiblePercent.toFixed(1)
          }% visible / ${renderPathRates.pickupHiddenPercent}% hidden`}
        </span>
      </div>
    </div>
  )
}

interface ModeCard {
  id: GameModeId
  label: string
  detail: string
}

interface MainMenuPanelProps {
  modeCards: ModeCard[]
  selectedMode: GameModeId
  sliderLabel: string
  sliderMin: number
  sliderMax: number
  sliderStep: number
  sliderValue: number
  locale: "en" | "ko"
  onSelectLocale: (nextLocale: "en" | "ko") => void
}

export const MainMenuPanel = (
  {
    modeCards,
    selectedMode,
    sliderLabel,
    sliderMin,
    sliderMax,
    sliderStep,
    sliderValue,
    locale,
    onSelectLocale,
  }: MainMenuPanelProps,
) => {
  return (
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
      <div class="menu-viewport-links">
        <details class="menu-credits-panel">
          <summary class="menu-credits-summary">{t`Credits`}</summary>
          <div class="menu-credits-content">
            <div class="menu-credits-section-title">{t`Music`}</div>
            <ul class="menu-credits-list">
              <li>
                <a
                  href="https://hellstarplus.bandcamp.com/track/my-divine-perversions"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  MY DIVINE PERVERSIONS - hellstar.plus (CC BY 4.0)
                </a>
              </li>
              <li>
                <a
                  href="https://hellstarplus.bandcamp.com/track/linear-gestalt"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  linear & gestalt - hellstar.plus (CC BY 4.0)
                </a>
              </li>
            </ul>
            <div class="menu-credits-section-title">{t`SFX`}</div>
            <ul class="menu-credits-list">
              <li>
                <a
                  href="https://freesound.org/people/damnsatinist/sounds/493913/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Kill confirm - damnsatinist #493913 (CC BY 4.0)
                </a>
              </li>
              <li>
                <a
                  href="https://freesound.org/people/DeltaCode/sounds/678385/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Item acquire - DeltaCode #678385 (CC0)
                </a>
              </li>
              <li>
                <a
                  href="https://freesound.org/people/Guinamun/sounds/690623/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Character damage - Guinamun #690623 (CC0)
                </a>
              </li>
              <li>
                <a
                  href="https://freesound.org/people/Angrycrazii/sounds/277322/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Player death - Angrycrazii #277322 (CC0)
                </a>
              </li>
              <li>
                <a
                  href="https://freesound.org/people/GFL7/sounds/276963/"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Reload - GFL7 #276963 (CC0)
                </a>
              </li>
            </ul>
          </div>
        </details>
        <a
          class="menu-github-fab"
          href="https://github.com/scarf005/head-full-of-flowers"
          target="_blank"
          rel="noreferrer noopener"
          aria-label={t`GitHub repository`}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" class="menu-github-icon">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.292 6.536 5.47 7.592.4.074.547-.174.547-.386 0-.19-.007-.693-.01-1.36-2.226.484-2.695-1.073-2.695-1.073-.364-.924-.89-1.17-.89-1.17-.725-.496.055-.486.055-.486.802.056 1.225.824 1.225.824.713 1.223 1.872.87 2.329.665.072-.517.28-.87.508-1.07-1.777-.2-3.644-.888-3.644-3.955 0-.873.312-1.587.824-2.147-.083-.202-.357-1.017.078-2.12 0 0 .672-.215 2.2.82a7.64 7.64 0 0 1 4.004 0c1.526-1.035 2.198-.82 2.198-.82.436 1.103.162 1.918.08 2.12.513.56.823 1.274.823 2.147 0 3.075-1.87 3.752-3.652 3.95.288.247.543.735.543 1.482 0 1.07-.01 1.932-.01 2.195 0 .214.144.464.55.385C13.71 14.534 16 11.54 16 8c0-4.42-3.58-8-8-8" />
          </svg>
          <span class="sr-only">{t`GitHub`}</span>
        </a>
      </div>
    </div>
  )
}

interface PausePanelProps {
  locale: "en" | "ko"
  onSelectLocale: (nextLocale: "en" | "ko") => void
}

export const PausePanel = ({ locale, onSelectLocale }: PausePanelProps) => {
  return (
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
}
