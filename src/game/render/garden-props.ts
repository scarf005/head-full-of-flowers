import { type CullBounds, isInsideCullBounds } from "../cull.ts"
import type { WorldState } from "../world/state.ts"
import { PROP_SPECS } from "../world/terrain-props.ts"
import { OBSTACLE_MATERIAL_PROP } from "../world/obstacle-grid.ts"
import type { DirectWebGLRenderer } from "./webgl-direct-renderer.ts"
import { GARDEN_ATLAS_SPRITE } from "./webgl-direct-sprites.ts"

export const renderGardenProps = ({ renderer, world, cull }: {
  renderer: DirectWebGLRenderer
  world: WorldState
  cull: CullBounds
}) => {
  const half = Math.floor(world.terrainMap.size / 2)
  for (const prop of world.terrainMap.props) {
    if (!isInsideCullBounds(prop.x, prop.y, cull, 3)) continue
    const left = Math.floor(prop.x - prop.width / 2 + half)
    const top = Math.floor(prop.y - prop.height / 2 + half)
    const index = top * world.obstacleGrid.size + left
    if (world.obstacleGrid.hp[index] <= 0 || world.obstacleGrid.material[index] !== OBSTACLE_MATERIAL_PROP) continue
    const flash = world.obstacleGrid.flash[index]
    const spec = PROP_SPECS[prop.kind]
    const size = Math.max(prop.width, prop.height)
    renderer.spriteRegion(
      GARDEN_ATLAS_SPRITE,
      spec.sprite % 4 / 4,
      Math.floor(spec.sprite / 4) / 4,
      1 / 4,
      1 / 4,
      prop.x,
      prop.y,
      size,
      size,
      { normalized: true, tint: flash > 0 ? "#ffb36b" : "#ffffff", alpha: 1 - flash * 0.35 },
    )
  }
}
