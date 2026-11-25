class_name Burn
## Fire on obstacle cells. A hedge, a door, a loot box or a prop of wood, cloth or plants catches fire from a burning
## zone, a flame shot or a blast that does not break it. It burns for `Tune.burn_time` seconds, sets its neighbours on
## fire and then breaks.

## Most cells that burn at one time.
const MOST := 48
## Prop kinds that burn. A barrel blows up at the first touch of fire. Rocks and a wheelbarrow do not burn. Reeds and
## lilies grow in water.
const PROPS: Array[StringName] = [
	&"bed",
	&"table",
	&"chair",
	&"bookshelf",
	&"shelf",
	&"counter",
	&"desk",
	&"workbench",
	&"crate",
	&"rug",
	&"plant",
	&"planter",
	&"bench",
	&"flowerbed",
]
## Metres from the sides of a burning cell, plus the radius of a unit, in which the fire hurts that unit.
const REACH := 0.5
## Seconds between two hurts of a unit by a burning cell, as in a molotov fire.
const EVERY := 0.22
const SIDES: Array[Vector2i] = [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]


static func can_burn(w: SimWorld, cell: Vector2i) -> bool:
	if not w.grid.is_damageable(cell):
		return false
	var i := cell.y * w.grid.size + cell.x
	var mat := w.grid.material[i]
	return mat in [Defs.Mat.HEDGE, Defs.Mat.DOOR, Defs.Mat.BOX] or w.grid.burnable.has(i)


## Sets a cell on fire for the unit `source`, or -1. All cells of a prop catch fire together. A barrel blows up.
static func ignite(w: SimWorld, cell: Vector2i, source: int, weapon: StringName) -> void:
	if not w.grid.in_bounds(cell):
		return
	var i := cell.y * w.grid.size + cell.x
	if w.grid.barrels.has(i):
		w.hit_cell(cell, 1.0, source)
		return
	if w.burning.has(i) or not can_burn(w, cell):
		return
	for c: int in w.grid.prop_cells.get(i, [i]):
		if w.burning.size() >= MOST:
			return
		var at := Vector2i(c % w.grid.size, c / w.grid.size)
		w.burning[c] = {cell = at, source = source, weapon = weapon, left = Tune.burn_time, tick = 0.0, spread = 1.0}
		w.emit(&"ignite", {cell = at})


## Sets on fire each cell that a circle overlaps.
static func ignite_circle(w: SimWorld, at: Vector2, radius: float, source: int, weapon: StringName) -> void:
	var lo := w.grid.cell_of(at - Vector2(radius, radius))
	var hi := w.grid.cell_of(at + Vector2(radius, radius))
	for y in range(lo.y, hi.y + 1):
		for x in range(lo.x, hi.x + 1):
			var middle := w.grid.center_of(Vector2i(x, y))
			if at.clamp(middle - Vector2(0.5, 0.5), middle + Vector2(0.5, 0.5)).distance_to(at) <= radius:
				ignite(w, Vector2i(x, y), source, weapon)


static func update(w: SimWorld, dt: float) -> void:
	for i: int in w.burning.keys():
		var b: Dictionary = w.burning[i]
		b.left -= dt
		b.tick -= dt
		b.spread -= dt
		if b.left <= 0.0 or not w.grid.is_damageable(b.cell):
			w.burning.erase(i)
			w.hit_cell(b.cell, INF, b.source)
			w.emit(&"burnt", {cell = b.cell, pos = w.grid.center_of(b.cell)})
			continue
		if b.tick <= 0.0:
			b.tick = EVERY
			_hurt(w, b)
		if b.spread <= 0.0:
			b.spread += 1.0
			for side in SIDES:
				if can_burn(w, b.cell + side) and w.rng.randf() < Tune.burn_spread:
					ignite(w, b.cell + side, b.source, b.weapon)


## Hurts the units near a burning cell by the rule of a burning zone.
static func _hurt(w: SimWorld, b: Dictionary) -> void:
	var middle := w.grid.center_of(b.cell)
	var owner: SimUnit = w.units[b.source] if b.source >= 0 else null
	for u in w.units:
		var gap := u.pos.clamp(middle - Vector2(0.5, 0.5), middle + Vector2(0.5, 0.5)).distance_to(u.pos)
		if (owner == null or u == owner or u.team != owner.team) and gap <= REACH + u.radius:
			Combat.damage(w, u, 1.0, b.source, u.pos, u.pos - middle, &"zone", b.weapon)
