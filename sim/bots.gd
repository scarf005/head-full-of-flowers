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
## As in the original game: a bot with this share of its health or less runs from the nearest enemy.
const LOW_HP := 0.32
## Aim and fire numbers of the original game for a bot that attacks and for a bot that runs. panic and reach are
## [easy, hard]. need (the aim that a shot needs) and hold (the chance to hold a shot) are [near, far, more on easy].
const FIGHT := {panic = [1.2, 0.0], reach = [19.0, 32.0], need = [0.8, 0.91, 0.12], hold = [0.02, 0.16, 0.34]}
const FLEE := {panic = [1.3, 0.45], reach = [15.0, 24.0], need = [0.78, 0.89, 0.1], hold = [0.06, 0.22, 0.26]}
const HUNT_RANGE := 36.0
const LOOT_RANGE := 5.0
const BOX_STAND_OFF := 5.0
const EDGE_MARGIN := 3.0
const THROW_RANGE := 12.0
const MOLOTOV_REACH := 10.5
## Distance to the middle of a low wall on its path within which a bot walks straight at it.
const VAULT_REACH := 1.6


static func think(w: SimWorld, u: SimUnit, dt: float) -> void:
	if w.nav == null:
		w.nav = NavGrid.new(w.grid)
	w.nav.sync(w.now)
	w.nav.update_hazards(w)
	u.ai_timer -= dt
	u.ai_path_timer -= dt
	u.ai_sense_timer -= dt
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
		&"fight", &"flee":
			move = _fight(w, u, target, dt)
		&"box":
			move = _box(w, u, dt) * wander
		&"loot":
			move = _follow(w, u, u.ai_goal) * pursuit
			_turn(u, move, dt)
		&"hunt":
			# Walk to where the enemy was at the last decision. A goal that follows the enemy flips the route from one
			# side of a wall to the other, and two bots then dance on the two sides of it.
			if decide or u.pos.distance_to(u.ai_goal) < 1.5:
				u.ai_goal = _hunt_goal(w, target)
			move = _follow(w, u, u.ai_goal) * pursuit
			_turn(u, move, dt)
		_:
			if u.pos.distance_to(u.ai_move) < 2.0:
				u.ai_move = w.random_point(w.arena_radius * 0.7)
			move = _follow(w, u, u.ai_move) * wander
			_turn(u, move, dt)
	# Survival comes first: leave the arena edge, then move away from fires and explosives.
	# Start at 1.5 m from the border and go on until the margin is back. One limit for both makes a bot whose
	# goal is in the margin step in and out without end.
	var from_border := w.arena_radius - u.pos.length()
	u.ai_edge = from_border < 1.5 or (u.ai_edge and from_border < EDGE_MARGIN)
	if u.ai_edge:
		move = -u.pos.normalized()
	var push := _avoid(w, u)
	if push != Vector2.ZERO:
		move = (move + push * 2.0).normalized()
	# A bot walks straight at a low wall on its path, and the vault takes it over.
	var over := push == Vector2.ZERO and not u.ai_edge and _at_low_wall(w, u, move)
	# Only a bot that runs away on hard is faster than 1.
	u.move = (u.ai_path[0] - u.pos).normalized() if over else _steer(w, u, move).limit_length(1.15)


## Picks the target and the goal. The bot fights the nearest enemy inside the aggro distance, with or without a line
## of sight. Line of sight is a cell ray, so it runs here and not every tick.
static func _sense(w: SimWorld, u: SimUnit) -> void:
	var aggro := 24.0 if w.hard else 14.0
	var enemies := w.units.filter(func(o: SimUnit) -> bool: return o.team != u.team)
	enemies.sort_custom(
		func(p: SimUnit, q: SimUnit) -> bool: return p.pos.distance_squared_to(u.pos) < q.pos.distance_squared_to(u.pos)
	)
	u.ai_target = -1
	u.ai_sight = false
	for other: SimUnit in enemies:
		if other.pos.distance_to(u.pos) > aggro:
			break
		if w.grid.ray_cell(u.pos, other.pos).x < 0:
			u.ai_target = other.index
			u.ai_sight = true
			u.ai_direct = w.grid.walk_clear(u.pos, other.pos)
			break
	if not u.ai_sight and not enemies.is_empty() and enemies[0].pos.distance_to(u.pos) < HUNT_RANGE:
		u.ai_target = enemies[0].index
	var near := u.ai_target >= 0 and w.units[u.ai_target].pos.distance_to(u.pos) < aggro
	var state := &"fight" if near else &"hunt" if u.ai_target >= 0 else &"wander"
	if u.ai_target >= 0 and u.hp <= u.max_hp * LOW_HP:
		state = &"flee"
	if not u.ai_sight:
		# Goals in the border margin are not worth the border damage.
		var safe := w.arena_radius - EDGE_MARGIN
		var best := LOOT_RANGE
		for p in w.pickups:
			if p.vel == Vector2.ZERO and p.pos.distance_to(u.pos) < best and p.pos.length() < safe and _wants(u, p):
				best = p.pos.distance_to(u.pos)
				state = &"loot"
				u.ai_goal = p.pos
		# Only a bot with no target goes for a box.
		if state != &"loot" and u.ai_target < 0:
			best = Tune.bot_box_range
			for cell: Vector2i in w.nav.boxes:
				var at := w.grid.center_of(cell)
				# The bot circles a box at the stand-off distance, so that ring must be out of the margin too.
				if at.distance_to(u.pos) < best and at.length() < safe - BOX_STAND_OFF:
					best = at.distance_to(u.pos)
					state = &"box"
					u.ai_goal = at
	if state != u.ai_state:
		u.ai_state = state
		u.ai_path_timer = 0.0
		if state == &"hunt":
			u.ai_goal = _hunt_goal(w, w.units[u.ai_target])


## Where a hunter walks: the place of the enemy, moved out of the border margin and then to the nearest free point.
static func _hunt_goal(w: SimWorld, target: SimUnit) -> Vector2:
	return w._free_near(target.pos.limit_length(w.arena_radius - EDGE_MARGIN))


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


## Runs at the target with a sideways strafe, leads it and fires when the aim is on it. Without a line of sight the
## bot walks the path to the target and does not fire. A bot in the flee state runs straight away and still fires.
static func _fight(w: SimWorld, u: SimUnit, target: SimUnit, dt: float) -> Vector2:
	var flee := u.ai_state == &"flee"
	var pursuit := 1.0 if w.hard else 0.68
	var to := target.pos - u.pos
	var d := maxf(to.length(), 0.001)
	var toward := to / d
	var away := -toward * (1.15 if w.hard else 0.8)
	if flee:
		# From 5 m to 3.5 m before the arena border, a bot that runs away turns along the border. A bot that goes
		# into the margin of the border and comes back steps in and out without end.
		var out := u.pos.normalized()
		var side := out.orthogonal() * (1.0 if away.dot(out.orthogonal()) >= 0.0 else -1.0)
		var room := clampf((w.arena_radius - u.pos.length() - EDGE_MARGIN - 0.5) / 1.5, 0.0, 1.0)
		var push := maxf(0.0, away.dot(out)) * (1.0 - room)
		away = (away + (side - out) * push).normalized() * away.length()
	if not u.ai_sight:
		var path := away if flee else _follow(w, u, target.pos) * pursuit
		_turn(u, toward if flee else path, dt)
		return path
	var id := u.weapon_id()
	var weapon: Dictionary = Defs.WEAPONS[id]
	# Through a window or over a low table the bot sees the enemy but cannot walk to it. Then it takes the path.
	var advance := toward if u.ai_direct else _follow(w, u, target.pos)
	# A bot with an explosive weapon makes room for its own blast and stops where it can fire.
	if BLAST_SAFE.has(id) and d < BLAST_SAFE[id] + 1.5:
		advance = -toward if d < BLAST_SAFE[id] else Vector2.ZERO
	if not flee and not w.hard and u.ai_timer > 1.1:
		# An easy bot only walks up for the first part of each decision. It does not aim or fire.
		return advance * 0.42
	var numbers: Dictionary = FLEE if flee else FIGHT
	# Aim at where the target is, with a sway that grows with range, own speed and panic. A target that strafes
	# is hard to hit.
	var far := clampf((d - 8.0) / 24.0, 0.0, 1.0)
	var panic: float = numbers.panic[int(w.hard)]
	var moving := clampf(u.vel.length() / u.speed, 0.0, 1.0)
	var sway := sin(w.now * 6.0 + u.index * 1.91) * (0.02 + far * 0.1 + moving * 0.035 + panic * 0.05)
	sway += cos(w.now * 3.0 + u.index * 0.67) * (0.015 + far * 0.07 + panic * 0.02)
	u.aim = u.aim.lerp(toward.rotated(sway), clampf(dt * (11.0 - far * 6.0 - panic * 1.6), 0.1, 0.95)).normalized()
	var need: float = lerpf(numbers.need[0], numbers.need[1], far) + (0.0 if w.hard else numbers.need[2])
	var hold: float = lerpf(numbers.hold[0], numbers.hold[1], far) + (0.0 if w.hard else numbers.hold[2])
	var fire_range := minf(numbers.reach[int(w.hard)], weapon.reach * u.range_mul * 0.95)
	# A shot at a wall that it cannot break is wasted.
	var cover := w.grid.ray_cell(u.pos, target.pos)
	var clear: bool = cover.x < 0 or Defs.MAT_ARMOR[w.grid.material[cover.y * w.grid.size + cover.x]] < weapon.damage
	if (
		clear
		and d < fire_range
		and d > BLAST_SAFE.get(id, 0.0)
		and u.aim.dot(toward) > need
		and w.rng.randf() > minf(0.98, hold)
	):
		u.want_fire = true
	if flee:
		return away
	if clear:
		_throw(w, u, d, toward)
	var strafe := toward.orthogonal() * sin(w.now + u.index) * (0.45 if w.hard else 0.14)
	return (advance + strafe).limit_length(1.0) * pursuit


## Throws the secondary when the enemy is nearer than 12 m and the landing point is clear and far from the bot.
static func _throw(w: SimWorld, u: SimUnit, d: float, toward: Vector2) -> void:
	if u.secondary_cooldown > 0.0 or d > THROW_RANGE or u.aim.dot(toward) < 0.8:
		return
	if w.rng.randf() >= (0.014 if w.hard else 0.0006):
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


## Lower is better: distance from the good range, with a bonus for higher tiers. A weapon whose blast would reach
## the bot does not fit.
static func _fit(id: StringName, d: float) -> float:
	var unsafe := 100.0 if d < BLAST_SAFE.get(id, 0.0) else 0.0
	return absf(d - GOOD_RANGE.get(id, 9.0)) - Arsenal.tier(id) * 4.0 + unsafe


## Direction to the next waypoint toward `goal`. Re-paths on a timer staggered by unit index.
static func _follow(w: SimWorld, u: SimUnit, goal: Vector2) -> Vector2:
	if u.ai_path_timer <= 0.0:
		u.ai_path_timer = 0.3 + 0.03 * (u.index % 11)
		u.ai_path = w.nav.path(u.pos, goal)
	# A bot in a vault goes over the low cells of its path, so it leaves their waypoints behind.
	while (
		not u.ai_path.is_empty()
		and (u.pos.distance_to(u.ai_path[0]) < 0.4 or (u.vaulting and w.grid.vaults_over(w.grid.cell_of(u.ai_path[0]))))
	):
		u.ai_path.remove_at(0)
	return ((goal if u.ai_path.is_empty() else u.ai_path[0]) - u.pos).normalized()


## True when the next waypoint of the bot is on a low wall, nearer than VAULT_REACH, and the bot moves toward it.
static func _at_low_wall(w: SimWorld, u: SimUnit, move: Vector2) -> bool:
	if u.ai_path.is_empty():
		return false
	var to := u.ai_path[0] - u.pos
	var ahead := move.normalized().dot(to.normalized()) > 0.7
	return ahead and to.length() < VAULT_REACH and w.grid.vaults_over(w.grid.cell_of(u.ai_path[0]))


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
