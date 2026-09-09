export const spriteRegionUvs = ({ entry, atlasWidth, atlasHeight, sx, sy, sw, sh, normalized = false }: {
  entry: { x: number; y: number; imageWidth: number; imageHeight: number }
  atlasWidth: number
  atlasHeight: number
  sx: number
  sy: number
  sw: number
  sh: number
  normalized?: boolean
}) => {
  const scaleX = normalized ? entry.imageWidth : 1
  const scaleY = normalized ? entry.imageHeight : 1
  const left = sx * scaleX
  const top = sy * scaleY
  const right = (sx + sw) * scaleX
  const bottom = (sy + sh) * scaleY
  if (
    !Number.isFinite(left + top + right + bottom) || left < 0 || top < 0 ||
    right <= left || bottom <= top || right > entry.imageWidth || bottom > entry.imageHeight
  ) return null
  return {
    u0: (entry.x + left) / atlasWidth,
    u1: (entry.x + right) / atlasWidth,
    v0: (entry.y + top) / atlasHeight,
    v1: (entry.y + bottom) / atlasHeight,
  }
}
