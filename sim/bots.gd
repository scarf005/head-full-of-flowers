class_name Bots
## Bot brain: writes the input fields of a unit each tick.
## A sense step picks one goal (fight, loot, box, hunt or wander) a few times per second. Each tick the bot walks
## to that goal on the shared A* grid, leaves the arena edge and hazards first, and aims and fires on its own.

## Distance at which each weapon fights best.
const GOOD_RANGE := {
	&"pistol": 9.0,
	&"assault": 12.0,
	&"battle-rifle": 14.0,
	&"shotgun": 5.0,
	&"auto-shotgun": 5.0,
	&"flamethrower": 4.5,
	&"grenade-launcher": 11.0,
	&"rocket-launcher": 13.0,
}
## Weapons whose shot explodes. The bot does not fire them at an enemy inside this distance.
const BLAST_SAFE := {&"grenade-launcher": 6.0, &"rocket-launcher": 7.5}
const HUNT_RANGE := 36.0
const LOOT_RANGE := 12.0
const BOX_RANGE := 10.0
const BOX_STAND_OFF := 5.0
const EDGE_MARGIN := 3.0
const THROW_RANGE := Vector2(6.0, 16.0)
const MOLOTOV_REACH := 10.5
const LOW_HP := 0.32


static func think(w: SimWorld, u: SimUnit, dt: float) -> void:
	if w.nav == null:
		w.nav = NavGrid.new(w.grid)
	w.nav.sync(w.now)
	w.nav.update_hazards(w)
	u.ai_timer -= dt
	u.ai_path_timer -= dt
	u.ai_sense_timer -= dt
	u.ai_react -= dt
	var max_error := 0.03 if w.hard else 0.12
	u.ai_aim_error = clampf(u.ai_aim_error + w.rng.randf_range(-1.0, 1.0) * dt * max_error * 4.0, -max_error, max_error)
	var decide := u.ai_timer <= 0.0
	if decide:
		u.ai_timer = w.rng.randf_range(0.4, 1.4) if w.hard else w.rng.randf_range(1.4, 3.0)
		u.ai_move = w.random_point(w.arena_radius * 0.7)
	if u.ai_sense_timer <= 0.0:
		u.ai_sense_timer = 0.08 + 0.01 * (u.index % 5)
		_sense(w, u)
	var target: SimUnit = w.units[u.ai_target] if u.ai_target >= 0 else null
	u.want_fire = false
	u.want_throw = false
	_manage_weapon(w, u, target, decide)
	var pursuit := 1.0 if w.hard else 0.68
	var wander := 0.7 if w.hard else 0.46
	var move := Vector2.ZERO
	match u.ai_state:
		&"fight":
			move = _fight(w, u, target, dt)
		&"box":
			move = _box(w, u, dt) * wander
		&"loot":
			move = _follow(w, u, u.ai_goal) * pursuit
			_turn(u, move, dt)
		&"hunt":
			move = _follow(w, u, target.pos) * pursuit
			_turn(u, target.pos - u.pos, dt)
		_:
			if u.pos.distance_to(u.ai_move) < 2.0:
				u.ai_move = w.random_point(w.arena_radius * 0.7)
			move = _follow(w, u, u.ai_move) * wander
			_turn(u, move, dt)
	# Survival comes first: leave the arena edge, then move away from fires and explosives.
	if u.pos.length() > w.arena_radius - EDGE_MARGIN:
		move = -u.pos.normalized()
	var push := _avoid(w, u)
	if push != Vector2.ZERO:
		move = (move + push * 2.0).normalized()
	u.move = _steer(w, u, move).limit_length(1.0)


## Picks the target and the goal. Line of sight is a cell ray, so it runs here and not every tick.
static func _sense(w: SimWorld, u: SimUnit) -> void:
	var aggro := 24.0 if w.hard else 14.0
	var enemies := w.units.filter(func(o: SimUnit) -> bool: return o.team != u.team)
	enemies.sort_custom(
		func(p: SimUnit, q: SimUnit) -> bool: return p.pos.distance_squared_to(u.pos) < q.pos.distance_squared_to(u.pos)
	)
	var previous := u.ai_target if u.ai_sight else -1
	u.ai_target = -1
	u.ai_sight = false
	for other: SimUnit in enemies:
		if other.pos.distance_to(u.pos) > aggro:
			break
		if w.grid.ray_cell(u.pos, other.pos).x < 0:
			u.ai_target = other.index
			u.ai_sight = true
			break
	if not u.ai_sight and not enemies.is_empty() and enemies[0].pos.distance_to(u.pos) < HUNT_RANGE:
		u.ai_target = enemies[0].index
	if u.ai_sight and u.ai_target != previous:
		# Easy bots wait a moment before they open fire on a new target.
		u.ai_react = 0.0 if w.hard else 0.34
	var state := &"fight" if u.ai_sight else &"hunt" if u.ai_target >= 0 else &"wander"
	if not u.ai_sight:
		var best := LOOT_RANGE
		for p in w.pickups:
			if p.vel == Vector2.ZERO and p.pos.distance_to(u.pos) < best and _wants(u, p):
				best = p.pos.distance_to(u.pos)
				state = &"loot"
				u.ai_goal = p.pos
		if state != &"loot":
			best = BOX_RANGE
			for cell: Vector2i in w.nav.boxes:
				var at := w.grid.center_of(cell)
				if at.distance_to(u.pos) < best:
					best = at.distance_to(u.pos)
					state = &"box"
					u.ai_goal = at
	if state != u.ai_state:
		u.ai_state = state
		u.ai_path_timer = 0.0


## True when a pickup is a perk the unit can still stack, or a weapon better than what it holds.
static func _wants(u: SimUnit, p: Dictionary) -> bool:
	if p.kind == &"perk":
		return u.perks.get(p.id, 0) < Defs.PERKS[p.id].max
	if not Arsenal.can_collect(u, p.id):
		return false
	var lowest := 99
	for s in u.slots:
		if s.id == p.id:
			return false
		if Defs.WEAPONS[s.id].kind == Defs.WEAPONS[p.id].kind:
			return Arsenal.tier(p.id) > Arsenal.tier(s.id)
		lowest = mini(lowest, Arsenal.tier(s.id))
	return u.slots.size() < Defs.PRIMARY_SLOT_CAP or Arsenal.tier(p.id) > lowest


## Approach to the good range of the weapon, strafe, lead the target and fire when the aim is on it.
static func _fight(w: SimWorld, u: SimUnit, target: SimUnit, dt: float) -> Vector2:
	var id := u.weapon_id()
	var weapon: Dictionary = Defs.WEAPONS[id]
	var to := target.pos - u.pos
	var d := maxf(to.length(), 0.001)
	var toward := to / d
	# Lead the target by the flight time of the shot. A second pass uses the distance to the led point.
	var speed: float = weapon.speed
	var lead := target.pos + target.vel * (d / speed)
	lead = target.pos + target.vel * (u.pos.distance_to(lead) / speed)
	var shot_dir := (lead - u.pos).normalized()
	var far := clampf((d - 8.0) / 24.0, 0.0, 1.0)
	_turn(u, shot_dir.rotated(u.ai_aim_error), dt, far)
	var need := lerpf(0.8, 0.91, far) + (0.06 if w.hard else 0.0)
	var fire_range := minf(32.0 if w.hard else 19.0, weapon.reach * u.range_mul * 0.95)
	if (
		u.ai_react <= 0.0
		and d < fire_range
		and d > BLAST_SAFE.get(id, 0.0)
		and u.aim.dot(shot_dir) > need
		and w.rng.randf() > lerpf(0.02, 0.16, far)
	):
		u.want_fire = true
	_throw(w, u, d, toward)
	var want: float = GOOD_RANGE.get(id, 9.0)
	if u.reload_cooldown > 0.0 or u.hp <= u.max_hp * LOW_HP:
		want += 8.0
	var side := 1.0 if sin(w.now * 1.3 + u.index * 1.7) >= 0.0 else -1.0
	var move := toward * clampf((d - want) / 3.0, -1.0, 1.0) + toward.orthogonal() * side * (0.45 if w.hard else 0.14)
	move = move.limit_length(1.0) * (1.0 if w.hard else 0.68)
	# Keep moving even at the good range, so the bot is never a still target.
	return move.normalized() * 0.3 if move.length() < 0.3 else move


## Throws the secondary when the enemy is 6 to 16 m away and the landing point is clear and far from the bot.
static func _throw(w: SimWorld, u: SimUnit, d: float, toward: Vector2) -> void:
	if u.secondary_cooldown > 0.0 or d < THROW_RANGE.x or d > THROW_RANGE.y or u.aim.dot(toward) < 0.97:
		return
	if w.rng.randf() >= (0.02 if w.hard else 0.004):
		return
	var land := u.pos + u.aim * (minf(d, MOLOTOV_REACH) if u.secondary == &"molotov" else d)
	if land.distance_to(u.pos) > Shots.BLAST_RADIUS + 1.0 and w.grid.ray_cell(u.pos, land).x < 0:
		u.want_throw = true


## Walks to a loot box, stops short of it and shoots it once it is in sight.
static func _box(w: SimWorld, u: SimUnit, dt: float) -> Vector2:
	var to := u.ai_goal - u.pos
	var clear := w.grid.ray_cell(u.pos, u.ai_goal) == w.grid.cell_of(u.ai_goal)
	_turn(u, to, dt)
	u.want_fire = clear and u.aim.dot(to.normalized()) > 0.95 and to.length() < Defs.WEAPONS[u.weapon_id()].reach * 0.9
	if clear and to.length() < BOX_STAND_OFF:
		return to.orthogonal().normalized() * 0.6
	return _follow(w, u, u.ai_goal)


## Reloads an empty or, out of a fight, a half-empty magazine. Swaps to the other slot when it fits better.
static func _manage_weapon(w: SimWorld, u: SimUnit, target: SimUnit, decide: bool) -> void:
	if u.reload_cooldown > 0.0:
		return
	var s := u.slot()
	var other: Dictionary = u.slots[1 - u.slot_index] if u.slots.size() == 2 else {}
	var ready: bool = not other.is_empty() and other.ammo > 0.0
	if s.ammo <= 0.0:
		if u.ai_sight and ready:
			u.want_swap = 1
		else:
			u.want_reload = true
		return
	var aggro := 24.0 if w.hard else 14.0
	var calm := not u.ai_sight and (target == null or target.pos.distance_to(u.pos) > aggro)
	if calm and s.ammo < Defs.WEAPONS[s.id].mag * 0.5:
		u.want_reload = true
	elif decide and u.ai_sight and ready:
		var d := target.pos.distance_to(u.pos)
		if _fit(other.id, d) + 3.0 < _fit(s.id, d):
			u.want_swap = 1


## Lower is better: distance from the good range, with a bonus for higher tiers.
static func _fit(id: StringName, d: float) -> float:
	return absf(d - GOOD_RANGE.get(id, 9.0)) - Arsenal.tier(id) * 4.0


## Direction to the next waypoint toward `goal`. Re-paths on a timer staggered by unit index.
static func _follow(w: SimWorld, u: SimUnit, goal: Vector2) -> Vector2:
	if u.ai_path_timer <= 0.0:
		u.ai_path_timer = 0.3 + 0.03 * (u.index % 11)
		u.ai_path = w.nav.path(u.pos, goal)
	while not u.ai_path.is_empty() and u.pos.distance_to(u.ai_path[0]) < 0.4:
		u.ai_path.remove_at(0)
	return ((goal if u.ai_path.is_empty() else u.ai_path[0]) - u.pos).normalized()


## Turns the aim toward `dir`. Far targets turn the aim slower, as in the original game.
static func _turn(u: SimUnit, dir: Vector2, dt: float, far := 0.0) -> void:
	if dir.length_squared() < 0.0001:
		return
	u.aim = u.aim.lerp(dir.normalized(), clampf(dt * (11.0 - far * 6.0), 0.1, 0.95)).normalized()


## Sum of pushes away from fires and explosives that can hurt this unit.
static func _avoid(w: SimWorld, u: SimUnit) -> Vector2:
	var push := Vector2.ZERO
	for h in w.nav.hazards:
		if h.team == u.team and h.owner != u.index:
			continue
		var away: Vector2 = u.pos - h.pos
		var reach: float = h.reach + 1.0
		if away.length() < reach:
			push += away.normalized() * (1.0 - away.length() / reach)
	return push


## Turns a move away from a solid cell just ahead, so the bot slides around corners instead of pushing into them.
static func _steer(w: SimWorld, u: SimUnit, move: Vector2) -> Vector2:
	if move == Vector2.ZERO:
		return move
	var dir := move.normalized()
	for turn in [0.0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]:
		if not w.grid.circle_hits(u.pos + dir.rotated(turn) * 0.45, u.radius):
			return dir.rotated(turn) * move.length()
	return move
