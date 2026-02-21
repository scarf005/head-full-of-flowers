export type TerrainTile =
  | "grass"
  | "clover"
  | "wild-grass"
  | "dirt"
  | "dirt-road"
  | "road-edge"
  | "gravel"
  | "concrete"

export interface MapObstacleBlueprint {
  kind: "warehouse" | "house" | "hedge" | "wall" | "box" | "high-tier-box"
  x: number
  y: number
  width: number
  height: number
  tiles: boolean[][]
}

export interface PickupSpawnPoint {
  x: number
  y: number
}

export interface TerrainMap {
  size: number
  tiles: TerrainTile[][]
  obstacles: MapObstacleBlueprint[]
  pickupSpawnPoints: PickupSpawnPoint[]
}
