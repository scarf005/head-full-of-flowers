export interface MinimapCompositeRefreshState {
  hasCanvas: boolean
  hasContext: boolean
  mapChanged: boolean
  pixelSizeChanged: boolean
  arenaChanged: boolean
  flowersDirty: boolean
  refreshDue: boolean
}

export const shouldRefreshMinimapComposite = ({
  hasCanvas,
  hasContext,
  mapChanged,
  pixelSizeChanged,
  arenaChanged,
  flowersDirty,
  refreshDue,
}: MinimapCompositeRefreshState) =>
  !hasCanvas ||
  !hasContext ||
  mapChanged ||
  pixelSizeChanged ||
  arenaChanged ||
  flowersDirty ||
  refreshDue
