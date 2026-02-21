export const randomInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1))

export const gridToWorld = (index: number, size: number) => index - Math.floor(size * 0.5) + 0.5
export const gridToWorldOrigin = (index: number, size: number) => index - Math.floor(size * 0.5)
export const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const hasNeighbor = (mask: boolean[][], x: number, y: number) => {
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) {
        continue
      }

      const nx = x + ox
      const ny = y + oy
      if (ny < 0 || nx < 0 || ny >= mask.length || nx >= mask[ny].length) {
        continue
      }

      if (mask[ny][nx]) {
        return true
      }
    }
  }

  return false
}

export const circleFitsArena = (gridX: number, gridY: number, size: number, margin: number) => {
  const wx = gridToWorld(gridX, size)
  const wy = gridToWorld(gridY, size)
  const radius = size * 0.5 - margin
  return wx * wx + wy * wy <= radius * radius
}

export const rectsOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  padding: number,
) => {
  return !(
    a.x + a.width * 0.5 + padding <= b.x - b.width * 0.5 ||
    a.x - a.width * 0.5 - padding >= b.x + b.width * 0.5 ||
    a.y + a.height * 0.5 + padding <= b.y - b.height * 0.5 ||
    a.y - a.height * 0.5 - padding >= b.y + b.height * 0.5
  )
}

export const rectFitsArena = (
  left: number,
  top: number,
  width: number,
  height: number,
  size: number,
  margin: number,
) => {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      if (!circleFitsArena(x, y, size, margin)) {
        return false
      }
    }
  }

  return true
}

export const rectTouchesMask = (
  mask: boolean[][],
  left: number,
  top: number,
  width: number,
  height: number,
  padding: number,
) => {
  for (let y = top - padding; y < top + height + padding; y += 1) {
    if (y < 0 || y >= mask.length) {
      continue
    }

    for (let x = left - padding; x < left + width + padding; x += 1) {
      if (x < 0 || x >= mask[y].length) {
        continue
      }

      if (mask[y][x]) {
        return true
      }
    }
  }

  return false
}

export const gridRectToWorldRect = (left: number, top: number, width: number, height: number, size: number) => {
  return {
    x: gridToWorldOrigin(left, size) + width * 0.5,
    y: gridToWorldOrigin(top, size) + height * 0.5,
    width,
    height,
  }
}
