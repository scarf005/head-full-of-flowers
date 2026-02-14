import type { RefObject } from "preact"
import { useEffect } from "preact/hooks"

import { FlowerArenaGame } from "./game.ts"

export const useFlowerArena = (canvasRef: RefObject<HTMLCanvasElement>) => {
  useEffect(() => {
    if (!canvasRef.current) {
      return
    }

    const game = new FlowerArenaGame(canvasRef.current)
    game.start()

    return () => {
      game.destroy()
    }
  }, [canvasRef])
}
