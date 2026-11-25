class_name Combat
## Firing, damage and explosions.

const AIM_ASSIST_RANGE := 24.0
## Seconds of hit stop for a blast, by the weapon that made it.
const BLAST_STOP := {&"grenade": 0.022, &"grenade-launcher": 0.01, &"rocket-launcher": 0.016, &"molotov": 0.006}


## Fires the active weapon when the unit can fire. Returns true when a shot left the barrel.
static func fire(w: SimWorld, u: SimUnit) -> bool:
	if u.shoot_cooldown > 0.0 or u.reload_cooldown > 0.0 or u.burst_left > 0:
		return false
	var s := u.slot()
	var weapon: Dictionary = Defs.WEAPONS[s.id]
	if s.ammo <= 0.0:
		_after_shot(w, u)
		return false
	var shots: int = mini(weapon.get("burst_shots", 1), int(s.ammo))
	var rate := u.fire_rate_mul * Tune.fire_rate
	var interval: float = weapon.get("burst_interval", 0.0) / rate
	u.shoot_cooldown = (interval * (shots - 1)) + maxf(0.0, weapon.cooldown / rate - interval * (shots - 1))
	u.burst_left = shots - 1
	u.burst_total = shots
	u.burst_timer = interval
	u.burst_weapon = s.id
	shoot(w, u)
	return true


## Fires the rest of a burst.
static func update_burst(w: SimWorld, u: SimUnit, dt: float) -> void:
	if u.burst_left <= 0:
		return
	u.burst_timer -= dt
	if u.burst_timer > 0.0:
		return
	u.burst_left -= 1
	u.burst_timer = Defs.WEAPONS[u.burst_weapon].burst_interval / (u.fire_rate_mul * Tune.fire_rate)
	if u.weapon_id() == u.burst_weapon and u.slot().ammo > 0.0:
		shoot(w, u)


## One trigger pull: spends one round and launches all pellets.
static func shoot(w: SimWorld, u: SimUnit) -> void:
	var s := u.slot()
	var weapon: Dictionary = Defs.WEAPONS[s.id]
	if not (u.is_player and Tune.endless_ammo > 0.5):
		s.ammo -= 1.0
	u.shots_fired += 1
	var dir := _assisted_aim(w, u)
	# The shots of a burst fan out around the aim.
	var fan: float = u.burst_total - 1 - u.burst_left - (u.burst_total - 1) * 0.5
	dir = dir.rotated(fan * weapon.get("burst_spread", 0.0))
	var spread: float = weapon.spread * Tune.spread * (0.7 if u.has_perk(&"laser_sight") else 1.0)
	var ricochets: int = weapon.get("ricochets", 0) if u.has_perk(&"ricochet_shells") else 0
	for pellet in weapon.pellets:
		var heading := dir.rotated(w.rng.randf_range(-spread, spread))
		(
			w
			. projectiles
			. append(
				{
					owner = u.index,
					team = u.team,
					kind = weapon.projectile,
					weapon = s.id,
					pos = u.pos + heading * (u.radius + 0.2),
					vel = heading * weapon.speed * Tune.shot_speed * w.rng.randf_range(1.02, 1.14),
					radius = weapon.radius * u.bullet_size_mul,
					damage = maxf(1.0, weapon.damage + u.damage_bonus),
					reach = weapon.reach * u.range_mul,
					travelled = 0.0,
					free = 0.0,
					ttl = maxf(0.3, weapon.reach / (weapon.speed * Tune.shot_speed) * 1.6),
					ricochets = ricochets,
					bounces = 2,
					accel = weapon.get("accel", 0.0),
					fuse = u.proximity_bonus,
					hedged = false,
				}
			)
		)
	while w.projectiles.size() > Defs.PROJECTILE_CAPACITY:
		w.projectiles.pop_front()
	u.recoil = minf(1.0, u.recoil + 0.38 + weapon.pellets * 0.05)
	w.emit(&"shot", {unit = u.index, pos = u.pos, dir = dir, weapon = s.id, first = u.burst_left == u.burst_total - 1})
	if s.ammo <= 0.0:
		_after_shot(w, u)


static func _after_shot(w: SimWorld, u: SimUnit) -> void:
	if Arsenal.start_reload(u):
		w.emit(&"reload", {unit = u.index})
	elif u.slot().reserve <= 0.0:
		Arsenal.drop_empty(u)


static func _assisted_aim(w: SimWorld, u: SimUnit) -> Vector2:
	var dir := u.aim.normalized() if u.aim.length_squared() > 0.0001 else Vector2.RIGHT
	if u.aim_assist <= 0.0:
		return dir
	var best := INF
	var best_delta := 0.0
	for other in w.units:
		if other.team == u.team:
			continue
		var to := other.pos - u.pos
		var delta := dir.angle_to(to)
		var score := absf(delta) * 8.0 + to.length()
		if absf(delta) <= u.aim_assist and to.length() <= AIM_ASSIST_RANGE and score < best:
			best = score
			best_delta = delta
	return dir.rotated(best_delta * 0.62)


## End of the laser sight beam of a unit. The beam goes along the aim for `Tune.laser_length` past the muzzle.
## It stops at the first wall, enemy or drawn front of a loot box that stops a bullet.
static func laser_end(w: SimWorld, u: SimUnit) -> Vector2:
	var dir := u.aim.normalized() if u.aim.length_squared() > 0.0001 else Vector2.RIGHT
	var end := u.pos + dir * (u.radius + 0.12 + Tune.laser_length)
	# Each enemy on the beam makes it shorter, so the nearest enemy sets the end.
	for other in w.units:
		var head := other.pos + Vector2.UP * Tune.unit_head
		var pair := Geometry2D.get_closest_points_between_segments(u.pos, end, other.pos, head)
		if other.team != u.team and pair[0].distance_to(pair[1]) <= other.radius * Tune.hit_size:
			end = pair[0]
	if w.grid.ray_cell(u.pos, end, true).x >= 0:
		end = w.grid.ricochet_impact(u.pos, end, true).get("point", u.pos)
	return w.grid.front_impact(u.pos, end, Tune.box_front).get("point", end)


## Hurts a unit and plants flowers. `source` is a unit index, or -1 for the arena border.
static func damage(
	w: SimWorld,
	target: SimUnit,
	amount: float,
	source: int,
	hit: Vector2,
	impact: Vector2,
	cause: StringName,
	weapon := &""
) -> void:
	var attacker: SimUnit = w.units[source] if source >= 0 else null
	var is_self := attacker == target
	if attacker and not is_self and attacker.team == target.team:
		return
	if target.is_player and Tune.god > 0.5:
		return
	var dealt := maxf(1.0, amount * Tune.damage - target.damage_reduction)
	if is_self and cause == &"blast":
		dealt = maxf(dealt, target.hp)
	var dir := impact.normalized() if impact.length_squared() > 0.0001 else Vector2.RIGHT.rotated(w.rng.randf() * TAU)
	target.hp -= dealt
	target.hit_flash = 1.0
	target.vel += dir * Tune.knockback
	var killed := target.hp <= 0.0
	var team := Defs.BURNT if is_self or attacker == null else attacker.team
	var opts := {arena_radius = w.arena_radius, now = w.now, grid = w.grid}
	opts.stagger = 0.25 if cause == &"shot" else 0.05
	var plan := FlowerField.burst_for(w.rng, dealt, impact.length())
	if killed:
		plan.amount *= 2
		plan.scale = minf(1.9, plan.scale + 0.25)
	w.flowers.burst(w.rng, team, hit, dir, plan.amount, plan.scale, opts)
	if attacker and not is_self:
		attacker.damage_dealt += dealt
		attacker.shots_hit += 1 if cause == &"shot" else 0
		if attacker.is_player:
			w.hit_stop = maxf(w.hit_stop, 0.012)
	if target.is_player:
		w.hit_stop = maxf(w.hit_stop, 0.016)
	(
		w
		. emit(
			&"hit",
			{
				target = target.index,
				target_pos = target.pos,
				source = source,
				pos = hit,
				dir = dir,
				damage = dealt,
				kill = killed,
				team = team,
				weapon = weapon,
			}
		)
	)
	if not killed:
		return
	for ring in 3:
		var offset := Vector2.from_angle(w.rng.randf() * TAU)
		var at := target.pos + offset * w.rng.randf_range(0.2, 0.95)
		w.flowers.burst(w.rng, team, at, offset, roundi(plan.amount * 0.85 / 2.0), plan.scale, opts)
	target.deaths += 1
	if attacker and not is_self:
		attacker.kills += 1
		attacker.hp = minf(attacker.max_hp, attacker.hp + Tune.kill_hp)
		if attacker.has_perk(&"kill_reload"):
			attacker.next_reload_mul = 0.5
		if attacker.kills % Defs.KILLS_PER_PERK_DROP == 0:
			Loot.spawn_perk(w, target.pos)
		else:
			Loot.spawn_weapon(w, target.pos, 0.0, true)
	w.respawn(target)


## Blast at a point. With `falloff` the damage is 3 at the rim and 8 at the centre.
## `source` is the unit that the blast counts for, or -1. `weapon` is the id that the hit events name.
## A blast with the cause &"blast" kills its own source at once.
static func explode(
	w: SimWorld,
	at: Vector2,
	radius: float,
	amount: float,
	source: int,
	falloff: bool,
	weapon: StringName,
	cause := &"blast"
) -> void:
	var owner: SimUnit = w.units[source] if source >= 0 else null
	for u in w.units:
		var to := u.pos - at
		var reach := radius + u.radius
		if to.length() > reach or (owner and u != owner and u.team == owner.team):
			continue
		var closeness := 1.0 - clampf(to.length() / reach, 0.0, 1.0)
		var push := (6.5 + radius * 2.4) * (0.25 + closeness * 0.75)
		var dir := to.normalized() if to.length_squared() > 0.0001 else Vector2.RIGHT
		u.vel += dir * push
		damage(w, u, 3.0 + 5.0 * closeness if falloff else amount, source, u.pos, dir * push * 6.0, cause, weapon)
	var cells := ceili(radius)
	var centre := w.grid.cell_of(at)
	for dy in range(-cells, cells + 1):
		for dx in range(-cells, cells + 1):
			var cell := centre + Vector2i(dx, dy)
			# As in the original game: the distance to the nearest point of the cell.
			var middle := w.grid.center_of(cell)
			var distance := at.clamp(middle - Vector2(0.5, 0.5), middle + Vector2(0.5, 0.5)).distance_to(at)
			if distance <= radius and w.grid.is_damageable(cell):
				w.hit_cell(cell, 2.5 + radius * 0.65 + (1.0 - distance / radius) * 1.1, source)
	w.pickups = w.pickups.filter(func(p: Dictionary) -> bool: return p.pos.distance_to(at) > radius)
	w.hit_stop = maxf(w.hit_stop, BLAST_STOP.get(weapon, 0.0))
	w.emit(&"explosion", {pos = at, radius = radius, source = source, weapon = weapon})
