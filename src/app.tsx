import "./app.css"

import { useRef } from "preact/hooks"

import { GameHud } from "./game/hud.tsx"
import { useFlowerArena } from "./game/use-flower-arena.ts"

export const App = () => {
  const canvasNode = useRef<HTMLCanvasElement>(null)

  useFlowerArena(canvasNode)

  return (
    <main class="game-shell">
      <div class="game-frame">
        <canvas
          ref={canvasNode}
          class="arena-canvas"
          aria-label="BadaBada arena"
        />
        <GameHud />
      </div>
    </main>
  )
}
