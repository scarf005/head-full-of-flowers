class_name SimWorld
## One match. Call tick() 60 times per second and read the state and the event list.

const MODES := {&"ffa": 1, &"tdm": 0, &"duo": 2, &"squad": 4}

var rng := RandomNumberGenerator.new()
var map: TerrainMap
var grid: ObstacleGrid
var flowers: FlowerField
## Path grid shared by the bots. The bot brain creates it on first use.
var nav: NavGrid
var units: Array[SimUnit] = []
var team_count := 0
var mode := &"ffa"
var hard := false
var projectiles: Array[Dictionary] = []
var throwables: Array[Dictionary] = []
var zones: Array[Dictionary] = []
var pickups: Array[Dictionary] = []
var pickup_seq := 0
var box_timer := Loot.BOX_INTERVAL.x
var duration := Defs.MATCH_SECONDS
var time_left := Defs.MATCH_SECONDS
var now := 0.0
var arena_start := 40.0
var arena_end := 20.0
var arena_radius := 40.0
var hit_stop := 0.0
var finished := false
## Bots do not think while this is false.
var bots_active := true
## Each: {type, ...}. The view reads and clears this list.
var events: Array[Dictionary] = []


## config: {seed, mode, size, hard}. size is the unit count in ffa, the units per side in tdm, else the team count.
func _init(config: Dictionary = {}, terrain: TerrainMap = null) -> void:
	rng.seed = config.get("seed", 1)
	mode = config.get("mode", &"ffa")
	hard = config.get("hard", false)
	map = terrain if terrain else MapGen.generate(rng)
	grid = map.build_grid()
	flowers = FlowerField.new()
	var size: int = config.get("size", 8)
	var per_team: int = MODES[mode] if mode != &"tdm" else size
	team_count = 2 if mode == &"tdm" else size
	for i in team_count * per_team:
		var u := SimUnit.new()
		u.index = i
		u.is_player = i == 0
		u.team = i / per_team
		u.reset_for_match()
		u.secondary = &"molotov" if i > 0 and rng.randf() > 0.58 else &"grenade"
		Arsenal.equip(u, &"pistol", INF)
		units.append(u)
	var radii := Defs.arena_radii(units.size())
	arena_start = radii.x
	arena_end = radii.y
	arena_radius = arena_start
	var start := rng.randf() * TAU
	for u in units:
		u.respawn(Vector2.from_angle(start + TAU * u.index / units.size()) * (arena_radius - 3.0))
		u.pos = _free_near(u.pos)
	Loot.spawn_weapon(self, _free_near(Vector2.ZERO), 1.0, true)
	var points := Array(map.pickup_points)
	for n in mini(points.size(), rng.randi_range(2, 5)):
		Loot.spawn_weapon(self, points.pop_at(rng.randi() % points.size()), 0.0)


func team_color(team: int) -> Color:
	if team == Defs.BURNT:
		return Defs.BURNT_COLOR
	if mode != &"ffa":
		return Defs.TEAM_COLORS[team % Defs.TEAM_COLORS.size()]
	return Defs.PLAYER_COLOR if team == 0 else Defs.BOT_COLORS[(team - 1) % Defs.BOT_COLORS.size()]


func emit(type: StringName, data: Dictionary) -> void:
	data.type = type
	events.append(data)


## 0 at the start of the match, 1 from 10 s before the end.
func loot_progress() -> float:
	return clampf((duration - time_left) / (duration - 10.0), 0.0, 1.0)


func high_tier_chance() -> float:
	return lerpf(Loot.HIGH_TIER_CHANCE.x, Loot.HIGH_TIER_CHANCE.y, loot_progress())


func random_point(radius: float) -> Vector2:
	return Vector2.from_angle(rng.randf() * TAU) * sqrt(rng.randf()) * radius


func unit_near(at: Vector2, distance: float) -> bool:
	return units.any(func(u: SimUnit) -> bool: return u.pos.distance_to(at) < distance)


## Teams by petals, most first: [{team, petals}].
func standings() -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	for team in team_count:
		rows.append({team = team, petals = flowers.score(team)})
	rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a.petals > b.petals)
	return rows


func hit_cell(cell: Vector2i, amount: float) -> void:
	var result := grid.damage_cell(cell, amount)
	if not result.damaged:
		return
	emit(&"cell", {cell = cell, destroyed = result.destroyed, material = result.material, cells = result.cells})
	if result.destroyed and result.material == Defs.Mat.BOX:
		Loot.spawn_weapon(self, grid.center_of(cell), 1.0 if result.high_tier else 0.0, true)


## Puts a dead unit back at the free point that is farthest from the other units.
func respawn(u: SimUnit) -> void:
	var best := Vector2.ZERO
	var best_score := -1.0
	var start := rng.randf() * TAU
	for ring in 6:
		var radius := maxf(1.0, arena_radius - 2.9 - ring * 0.9)
		for sample in 96:
			var at := Vector2.from_angle(start + TAU * (sample + 0.5 * (ring % 2)) / 96.0) * radius
			if grid.circle_hits(at, 0.9):
				continue
			var nearest := INF
			for other in units:
				if other != u:
					nearest = minf(nearest, other.pos.distance_squared_to(at))
			if nearest > best_score:
				best_score = nearest
				best = at
	u.respawn(best)
	if not u.is_player:
		u.slots = []
		Arsenal.equip(u, &"pistol", INF)
		if rng.randf() > 0.54:
			var id: StringName = Defs.LOOTABLE[rng.randi() % 2]
			Arsenal.equip(u, id, Defs.pickup_ammo(id))
	emit(&"respawn", {unit = u.index, pos = best})


func tick() -> void:
	if finished:
		return
	var real := Defs.TICK * Defs.GAME_SPEED
	var dt := real * 0.12 if hit_stop > 0.0 else real
	hit_stop = maxf(0.0, hit_stop - real)
	now += dt
	time_left -= real
	if time_left <= 0.0:
		time_left = 0.0
		finished = true
		emit(&"finish", {})
		return
	arena_radius = lerpf(arena_start, arena_end, 1.0 - time_left / duration)
	for u in units:
		if bots_active and not u.is_player:
			Bots.think(self, u, dt)
		_update_unit(u, dt)
	_separate_units()
	for u in units:
		_push_out_of_cells(u)
		_keep_in_arena(u, dt)
	Shots.update_projectiles(self, dt)
	Shots.update_throwables(self, dt)
	Shots.update_zones(self, dt)
	Loot.update(self, dt)


func _update_unit(u: SimUnit, dt: float) -> void:
	u.shoot_cooldown = maxf(0.0, u.shoot_cooldown - dt)
	u.secondary_cooldown = maxf(0.0, u.secondary_cooldown - dt)
	u.hit_flash = maxf(0.0, u.hit_flash - dt * 6.5)
	u.recoil = maxf(0.0, u.recoil - dt * 8.5)
	if u.reload_cooldown > 0.0:
		u.reload_cooldown -= dt
		if u.reload_cooldown <= 0.0:
			Arsenal.finish_reload(u)
	var wish := u.move.limit_length(1.0) * u.speed * TerrainMap.speed_mul(map.tile_at(u.pos))
	u.vel = u.vel.lerp(wish, clampf(dt * (24.0 if wish != Vector2.ZERO else 18.0), 0.0, 1.0))
	u.pos += u.vel * dt
	if u.want_swap != 0:
		Arsenal.swap(u, u.want_swap)
		u.want_swap = 0
	if u.want_reload and Arsenal.start_reload(u):
		emit(&"reload", {unit = u.index})
	u.want_reload = false
	Combat.update_burst(self, u, dt)
	if u.want_fire:
		Combat.fire(self, u)
	if u.want_throw:
		Shots.throw_secondary(self, u)
	Loot.collect(self, u)


func _separate_units() -> void:
	for i in units.size():
		for j in range(i + 1, units.size()):
			var a := units[i]
			var b := units[j]
			var gap := b.pos - a.pos
			var overlap := a.radius + b.radius - gap.length()
			if overlap <= 0.0:
				continue
			var dir := gap.normalized() if gap.length_squared() > 0.000001 else Vector2.RIGHT
			a.pos -= dir * overlap * 0.5
			b.pos += dir * overlap * 0.5
			a.vel -= dir * overlap * 2.0
			b.vel += dir * overlap * 2.0


func _push_out_of_cells(u: SimUnit) -> void:
	for pass_index in 3:
		var lo := grid.cell_of(u.pos - Vector2(u.radius, u.radius))
		var hi := grid.cell_of(u.pos + Vector2(u.radius, u.radius))
		for gy in range(lo.y, hi.y + 1):
			for gx in range(lo.x, hi.x + 1):
				if not grid.is_solid(Vector2i(gx, gy)):
					continue
				var centre := grid.center_of(Vector2i(gx, gy))
				var nearest := u.pos.clamp(centre - Vector2(0.5, 0.5), centre + Vector2(0.5, 0.5))
				var gap := u.pos - nearest
				if gap.length_squared() >= u.radius * u.radius:
					continue
				if gap.length_squared() < 0.000001:
					# The centre is inside the cell. Leave through the nearest side.
					var off := u.pos - centre
					gap = Vector2(signf(off.x), 0.0) if absf(off.x) > absf(off.y) else Vector2(0.0, signf(off.y))
					u.pos = centre + gap * (0.5 + u.radius)
				else:
					u.pos = nearest + gap.normalized() * u.radius


func _keep_in_arena(u: SimUnit, dt: float) -> void:
	u.border_cooldown = maxf(0.0, u.border_cooldown - dt)
	var limit := arena_radius - u.radius
	if u.pos.length() <= limit:
		return
	var out := u.pos.normalized()
	u.pos = out * limit
	if u.border_cooldown <= 0.0:
		u.border_cooldown = Defs.ARENA_BORDER_DAMAGE_COOLDOWN
		Combat.damage(self, u, Defs.ARENA_BORDER_DAMAGE, -1, u.pos, -out, &"arena")


## The nearest point to `at` where a unit does not touch an obstacle.
func _free_near(at: Vector2) -> Vector2:
	for step in 200:
		var p := at + Vector2.from_angle(step * 2.4) * step * 0.15
		if not grid.circle_hits(p, 0.9):
			return p
	return at
