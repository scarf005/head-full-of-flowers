import "./app.css"

import { t } from "@lingui/core/macro"
import { useEffect, useRef } from "preact/hooks"

import { GameHud } from "./game/hud.tsx"
import { languageSignal } from "./game/signals.ts"
import { useFlowerArena } from "./game/use-flower-arena.ts"

export const App = () => {
  const canvasNode = useRef<HTMLCanvasElement>(null)
  const locale = languageSignal.value

  useFlowerArena(canvasNode)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return (
    <main class="game-shell">
      <div class="game-frame">
        <canvas
          ref={canvasNode}
          class="arena-canvas"
          aria-label={t`BadaBada arena`}
        />
        <GameHud />
      </div>
    </main>
  )
}
