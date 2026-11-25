class_name FlowerField
## Flowers on the ground. The score of a team is the petal sum of its live flowers.

const INACTIVE := -2
const CELL_WEIGHT_CAP := 18

var capacity: int
var pos: PackedVector2Array
var size: PackedFloat32Array
## Team index, Defs.BURNT or INACTIVE.
var owner: PackedInt32Array
var petals: PackedByteArray
## World time at which the flower starts to bloom.
var bloom_at: PackedFloat32Array
var scores := {}
## Slots changed since the view last cleared this list.
var dirty: PackedInt32Array = []
var _cursor := 0
var _grid: int
var _weight: PackedInt32Array
var _cells := {}


func _init(flower_capacity: int = Defs.FLOWER_CAPACITY, grid_size: int = Defs.MAP_SIZE) -> void:
	capacity = flower_capacity
	_grid = grid_size
	pos.resize(capacity)
	size.resize(capacity)
	owner.resize(capacity)
	owner.fill(INACTIVE)
	petals.resize(capacity)
	bloom_at.resize(capacity)
	_weight.resize(_grid * _grid)


func score(team: int) -> int:
	return scores.get(team, 0)


## Burst size and flower size scale for a hit: {amount, scale}.
static func burst_for(rng: RandomNumberGenerator, damage: float, speed: float) -> Dictionary:
	var damage_f := clampf(damage / 2.1, 0.35, 2.4)
	var speed_f := clampf(speed / 40.0, 0.2, 2.2)
	var amount_scale := clampf(1.0 + (speed_f - 1.0) * 0.65 - (damage_f - 1.0) * 0.5, 0.55, 1.75)
	return {
		amount = maxi(2, roundi(rng.randi_range(10, 20) * amount_scale * 2.0)),
		scale = clampf(1.0 + (damage_f - 1.0) * 0.7 - (speed_f - 1.0) * 0.45, 0.6, 1.9),
	}


## Plants `amount` flowers in a cone along `dir`, inside the arena and not in a solid cell of `opts.grid`.
func burst(
	rng: RandomNumberGenerator, team: int, origin: Vector2, dir: Vector2, amount: int, scale: float, opts: Dictionary
) -> void:
	var base := dir.angle()
	var limit: float = maxf(0.0, opts.arena_radius - 0.2)
	for n in amount:
		var bias := pow(rng.randf(), 1.6)
		var angle := base + (bias if rng.randf() < 0.5 else -bias) * 0.42
		var heading := Vector2.from_angle(angle)
		var flower_size := rng.randf_range(0.16, 0.42) * scale
		var reach := lerpf(0.08, 1.85, pow(rng.randf(), 0.65)) * (0.5 + (1.0 - bias) * 0.7)
		var p := origin + dir * 0.26 + heading * reach
		var weight := clampi(roundi(flower_size / 0.2), 1, 3)
		for attempt in 9:
			if _weight[_cell(p)] + weight <= CELL_WEIGHT_CAP:
				break
			p += heading * 0.34
		p = p.limit_length(limit)
		# A flower that would land in a wall or on furniture comes back toward the hit.
		var grid: ObstacleGrid = opts.get("grid")
		for attempt in 3:
			if grid == null or not grid.is_solid(grid.cell_of(p)):
				break
			p = origin.lerp(p, 0.5)
		# No flower in a wall, and none in a cell that is full after all moves.
		if grid and grid.is_solid(grid.cell_of(p)) or _weight[_cell(p)] + weight > CELL_WEIGHT_CAP:
			continue
		_plant(
			team, p, flower_size, weight, opts.now + rng.randf_range(0.0, opts.get("stagger", 0.0) / Tune.flower_speed)
		)


## Turns the flowers in a circle into burnt flowers. Returns the number of flowers changed.
func scorch(center: Vector2, radius: float) -> int:
	var changed := 0
	var half := _grid / 2
	for gy in range(maxi(0, floori(center.y - radius) + half), mini(_grid - 1, floori(center.y + radius) + half) + 1):
		for gx in range(
			maxi(0, floori(center.x - radius) + half), mini(_grid - 1, floori(center.x + radius) + half) + 1
		):
			for i: int in _cells.get(gy * _grid + gx, []):
				if owner[i] == Defs.BURNT or pos[i].distance_squared_to(center) > radius * radius:
					continue
				scores[owner[i]] = score(owner[i]) - petals[i]
				scores[Defs.BURNT] = score(Defs.BURNT) + petals[i]
				owner[i] = Defs.BURNT
				dirty.append(i)
				changed += 1
	return changed


func _cell(p: Vector2) -> int:
	var half := _grid / 2
	return clampi(floori(p.y) + half, 0, _grid - 1) * _grid + clampi(floori(p.x) + half, 0, _grid - 1)


func _plant(team: int, p: Vector2, flower_size: float, weight: int, at: float) -> void:
	var i := _cursor
	_cursor = (_cursor + 1) % capacity
	if owner[i] != INACTIVE:
		# The pool is full. The oldest flower gives its slot and its score.
		var old := _cell(pos[i])
		scores[owner[i]] = score(owner[i]) - petals[i]
		_weight[old] -= clampi(roundi(size[i] / 0.2), 1, 3)
		_cells[old].erase(i)
	var cell := _cell(p)
	pos[i] = p
	size[i] = flower_size
	owner[i] = team
	petals[i] = maxi(1, roundi(flower_size / 0.16))
	bloom_at[i] = at
	scores[team] = score(team) + petals[i]
	_weight[cell] += weight
	if not _cells.has(cell):
		_cells[cell] = []
	_cells[cell].append(i)
	dirty.append(i)
