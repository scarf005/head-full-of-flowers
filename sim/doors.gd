class_name Doors
## Doors of the buildings. A closed door stops shots and sight. It opens for a unit that comes near and closes
## behind it, so a door never stops a unit. It stays open while a shot or a thrown thing is in its cell. Shots, fire
## and blasts break it.

## A door opens for a unit within this distance of the middle of its cell.
const REACH := 1.5
## A door closes this many seconds after the last unit left.
const CLOSE_SECONDS := 0.5


## One entry for each door of the map: {cell, open, wait}.
static func create(map: TerrainMap) -> Array[Dictionary]:
	var doors: Array[Dictionary] = []
	for building in map.buildings:
		for cell: Vector2i in building.doors:
			doors.append({cell = cell, open = false, wait = 0.0})
	return doors


static func update(w: SimWorld, dt: float) -> void:
	for door in w.doors:
		var i: int = door.cell.y * w.grid.size + door.cell.x
		if w.grid.material[i] != Defs.Mat.DOOR:
			continue
		var at := w.grid.center_of(door.cell)
		var opener: SimUnit = null
		for u in w.units:
			if u.pos.distance_squared_to(at) < REACH * REACH:
				opener = u
				break
		if opener:
			door.wait = CLOSE_SECONDS
			if not door.open:
				_move(w, door, true, opener.pos)
		elif door.open:
			# A shot or a thrown thing in the cell keeps the door open, so the door does not close on it.
			var inside := func(shot: Dictionary) -> bool: return w.grid.cell_of(shot.pos) == door.cell
			door.wait = CLOSE_SECONDS if w.throwables.any(inside) or w.projectiles.any(inside) else door.wait - dt
			if door.wait <= 0.0:
				_move(w, door, false, at)


## `from` is the place of the unit that opens the door. The view swings the leaf away from it.
static func _move(w: SimWorld, door: Dictionary, open: bool, from: Vector2) -> void:
	door.open = open
	w.grid.solid[door.cell.y * w.grid.size + door.cell.x] = 0 if open else 1
	w.emit(&"door", {cell = door.cell, open = open, from = from})
