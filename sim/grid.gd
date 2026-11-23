class_name ObstacleGrid
## Destructible obstacles on a 1 m grid. Cell (x, y) covers world [x - half, x - half + 1).

var size: int
var half: int
var solid: PackedByteArray
var hp: PackedFloat32Array
var material: PackedByteArray
var high_tier: PackedByteArray
## Cell index -> all cell indices of the prop that owns it. A prop breaks as one piece.
var prop_cells := {}
## Bumped when a cell is added or removed.
var revision := 0


func _init(grid_size: int = Defs.MAP_SIZE) -> void:
	size = grid_size
	half = size / 2
	solid.resize(size * size)
	hp.resize(size * size)
	material.resize(size * size)
	high_tier.resize(size * size)


func cell_of(p: Vector2) -> Vector2i:
	return Vector2i(floori(p.x) + half, floori(p.y) + half)


func center_of(cell: Vector2i) -> Vector2:
	return Vector2(cell.x - half + 0.5, cell.y - half + 0.5)


func in_bounds(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < size and cell.y < size


func is_solid(cell: Vector2i) -> bool:
	return in_bounds(cell) and solid[cell.y * size + cell.x] > 0


func is_damageable(cell: Vector2i) -> bool:
	return in_bounds(cell) and hp[cell.y * size + cell.x] > 0.0


func set_cell(cell: Vector2i, mat: int, is_high_tier := false, is_solid_cell := true) -> void:
	if not in_bounds(cell):
		return
	var i := cell.y * size + cell.x
	solid[i] = 1 if is_solid_cell else 0
	material[i] = mat
	hp[i] = Defs.MAT_HP[mat]
	high_tier[i] = 1 if is_high_tier else 0
	revision += 1


## Returns {damaged, destroyed, dealt, material, high_tier, cells}.
func damage_cell(cell: Vector2i, amount: float) -> Dictionary:
	if not is_damageable(cell):
		return {damaged = false, destroyed = false, dealt = 0.0, material = Defs.Mat.NONE, cells = []}
	var i := cell.y * size + cell.x
	var mat := material[i]
	var dealt := maxf(0.0, amount - Defs.MAT_ARMOR[mat])
	var after := maxf(0.0, hp[i] - dealt)
	var destroyed := after <= 0.0
	var was_high_tier := high_tier[i] > 0
	var affected: Array = prop_cells.get(i, [i])
	for c: int in affected:
		hp[c] = after
		if destroyed:
			solid[c] = 0
			material[c] = Defs.Mat.NONE
			high_tier[c] = 0
			prop_cells.erase(c)
	if destroyed:
		revision += 1
	return {
		damaged = true,
		destroyed = destroyed,
		dealt = dealt,
		material = mat,
		high_tier = destroyed and was_high_tier,
		cells = affected if destroyed else [],
	}


## True when a circle overlaps a solid cell.
func circle_hits(p: Vector2, radius: float) -> bool:
	var lo := cell_of(p - Vector2(radius, radius))
	var hi := cell_of(p + Vector2(radius, radius))
	for gy in range(maxi(0, lo.y), mini(size - 1, hi.y) + 1):
		for gx in range(maxi(0, lo.x), mini(size - 1, hi.x) + 1):
			if solid[gy * size + gx] == 0:
				continue
			var c := Vector2(gx - half + 0.5, gy - half + 0.5)
			var nearest := p.clamp(c - Vector2(0.5, 0.5), c + Vector2(0.5, 0.5))
			if p.distance_squared_to(nearest) < radius * radius:
				return true
	return false


## First damageable cell on a segment, or (-1, -1).
func ray_cell(from: Vector2, to: Vector2) -> Vector2i:
	var d := to - from
	var steps := maxi(1, ceili(maxf(absf(d.x), absf(d.y)) * 4.0))
	for step in steps + 1:
		var cell := cell_of(from.lerp(to, float(step) / steps))
		if is_damageable(cell):
			return cell
	return Vector2i(-1, -1)


## Where a move from `from` to `to` first enters a solid cell: {point, normal}, or {} when it does not.
func ricochet_impact(from: Vector2, to: Vector2) -> Dictionary:
	var move := to - from
	var step := Vector2i(signi(int(signf(move.x))), signi(int(signf(move.y))))
	if step == Vector2i.ZERO:
		return {}
	var cell := cell_of(from)
	if is_solid(cell):
		return {}
	var bound_x := float(cell.x - half + (1 if step.x > 0 else 0))
	var bound_y := float(cell.y - half + (1 if step.y > 0 else 0))
	var t_max_x := INF if step.x == 0 else (bound_x - from.x) / move.x
	var t_max_y := INF if step.y == 0 else (bound_y - from.y) / move.y
	var t_delta_x := INF if step.x == 0 else 1.0 / absf(move.x)
	var t_delta_y := INF if step.y == 0 else 1.0 / absf(move.y)
	while minf(t_max_x, t_max_y) <= 1.0:
		var t := minf(t_max_x, t_max_y)
		var cross_x := absf(t_max_x - t) <= 0.0000001
		var cross_y := absf(t_max_y - t) <= 0.0000001
		var next := cell + Vector2i(step.x if cross_x else 0, step.y if cross_y else 0)
		if is_solid(next):
			var normal := Vector2(-step.x if cross_x else 0, -step.y if cross_y else 0).normalized()
			return {point = from + move * t, normal = normal}
		cell = next
		if cross_x:
			t_max_x += t_delta_x
		if cross_y:
			t_max_y += t_delta_y
	return {}
