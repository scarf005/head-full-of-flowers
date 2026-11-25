class_name NavGrid
## A* grid over the obstacle cells, shared by all bots of a world. It also lists loot boxes and live hazards.

## Seconds between two rebuilds of the solid cells. Destroyed cells reach the bots after this delay at most.
const SYNC_INTERVAL := 0.25
## Cost of a cell that a bot vaults, as a multiple of a free cell.
const VAULT_COST := 2.0

var grid: ObstacleGrid
var astar := AStarGrid2D.new()
## Cell -> true for each loot box cell.
var boxes := {}
## Each: {pos, reach, team, owner}. Fires and live explosives, rebuilt once per tick.
var hazards: Array[Dictionary] = []
var _solid: PackedByteArray
var _revision := -1
var _next_sync := -INF
var _hazard_time := -INF


func _init(obstacles: ObstacleGrid) -> void:
	grid = obstacles
	astar.region = Rect2i(0, 0, grid.size, grid.size)
	astar.offset = Vector2(0.5 - grid.half, 0.5 - grid.half)
	astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	astar.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	astar.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	astar.update()
	_solid.resize(grid.size * grid.size)


## Copies the solid cells that changed since the last call. Only rows that differ are walked.
func sync(now: float) -> void:
	if grid.revision == _revision or now < _next_sync:
		return
	_revision = grid.revision
	_next_sync = now + SYNC_INTERVAL
	var size := grid.size
	for y in size:
		var row := y * size
		if grid.solid.slice(row, row + size) == _solid.slice(row, row + size):
			continue
		for x in size:
			var cell := Vector2i(x, y)
			# A door opens for a unit that comes near. A bot vaults a low wall.
			var over := grid.vaults_over(cell)
			var solid := grid.solid[row + x] > 0 and grid.material[row + x] != Defs.Mat.DOOR and not over
			if solid != (_solid[row + x] > 0):
				astar.set_point_solid(cell, solid)
			astar.set_point_weight_scale(cell, VAULT_COST if over else 1.0)
			if solid and grid.material[row + x] == Defs.Mat.BOX:
				boxes[cell] = true
			else:
				boxes.erase(cell)
	_solid = grid.solid.duplicate()


## Waypoints from `from` to `to` without the start cell. Ends near `to` when `to` cannot be reached.
func path(from: Vector2, to: Vector2) -> PackedVector2Array:
	var last := Vector2i(grid.size - 1, grid.size - 1)
	var start := grid.cell_of(from).clamp(Vector2i.ZERO, last)
	var points := astar.get_point_path(start, grid.cell_of(to).clamp(Vector2i.ZERO, last), true)
	if not points.is_empty():
		points.remove_at(0)
	return points


## Builds the hazard list once per tick: fires, grenades, rockets and thrown secondaries.
func update_hazards(w: SimWorld) -> void:
	if _hazard_time == w.now:
		return
	_hazard_time = w.now
	hazards.clear()
	for z in w.zones:
		hazards.append({pos = z.pos, reach = z.radius + 0.6, team = w.units[z.owner].team, owner = z.owner})
	for p in w.projectiles:
		if p.kind == &"grenade" or p.kind == &"rocket":
			var reach := Shots.BLAST_RADIUS * (1.4 if p.kind == &"rocket" else 1.0)
			hazards.append({pos = p.pos, reach = reach, team = p.team, owner = p.owner})
	for t in w.throwables:
		hazards.append({pos = t.pos, reach = 3.2 if t.molotov else Shots.BLAST_RADIUS, team = t.team, owner = t.owner})
