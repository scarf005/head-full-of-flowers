const colorFloatCache = new Map<string, readonly [number, number, number]>()

export const parseHexColorFloat = (hex: string) => {
  const cached = colorFloatCache.get(hex)
  if (cached) {
    return cached
  }

  const cleaned = hex.replace("#", "")
  if (cleaned.length !== 6) {
    const fallback = [1, 1, 1] as const
    colorFloatCache.set(hex, fallback)
    return fallback
  }

  const red = Number.parseInt(cleaned.slice(0, 2), 16) / 255
  const green = Number.parseInt(cleaned.slice(2, 4), 16) / 255
  const blue = Number.parseInt(cleaned.slice(4, 6), 16) / 255
  const parsed = [red, green, blue] as const
  colorFloatCache.set(hex, parsed)
  return parsed
}
