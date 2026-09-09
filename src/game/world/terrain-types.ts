export type TerrainTile =
  | "grass"
  | "clover"
  | "wild-grass"
  | "dirt"
  | "dirt-road"
  | "road-edge"
  | "gravel"
  | "concrete"
  | "water"
  | "marsh"
  | "sand"
  | "wood-floor"
  | "tile-floor"

export interface HouseRoom {
  left: number
  top: number
  width: number
  height: number
}

export interface MapObstacleBlueprint {
  kind: "warehouse" | "house" | "hedge" | "wall" | "box" | "high-tier-box"
  x: number
  y: number
  width: number
  height: number
  tiles: boolean[][]
  rooms?: HouseRoom[]
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
  props: MapProp[]
}

export type MapPropKind =
  | "flowerbed"
  | "bench"
  | "reeds"
  | "lilies"
  | "mushrooms"
  | "rocks"
  | "urn"
  | "wheelbarrow"
  | "bed"
  | "table"
  | "chair"
  | "bookshelf"
  | "rug"
  | "plant"
  | "barrel"
  | "birdbath"

export interface MapProp {
  kind: MapPropKind
  x: number
  y: number
  width: number
  height: number
  solid: boolean
}
