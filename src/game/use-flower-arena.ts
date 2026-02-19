import type { RefObject } from "preact"
import { useEffect } from "preact/hooks"

import { FlowerArenaGame } from "./game.ts"
import { preloadItemSprites } from "./render/pixel-art.ts"

export const useFlowerArena = (canvasRef: RefObject<HTMLCanvasElement>) => {
  useEffect(() => {
    if (!canvasRef.current) {
      return
    }

    let isDisposed = false
    let game: FlowerArenaGame | null = null

    void preloadItemSprites().then(() => {
      if (isDisposed || !canvasRef.current) {
        return
      }

      game = new FlowerArenaGame(canvasRef.current)
      game.start()
    })

    return () => {
      isDisposed = true
      game?.destroy()
    }
  }, [canvasRef])
}
