export interface MinimapCompositeRefreshState {
  hasCanvas: boolean
  hasContext: boolean
  mapChanged: boolean
  pixelSizeChanged: boolean
  arenaChanged: boolean
  refreshDue: boolean
}

export const shouldRefreshMinimapComposite = ({
  hasCanvas,
  hasContext,
  mapChanged,
  pixelSizeChanged,
  arenaChanged,
  refreshDue,
}: MinimapCompositeRefreshState) =>
  !hasCanvas ||
  !hasContext ||
  mapChanged ||
  pixelSizeChanged ||
  arenaChanged ||
  refreshDue
