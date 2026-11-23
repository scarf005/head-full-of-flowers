class_name Shots
## Projectiles, thrown grenades and molotovs, and burning zones.

const BLAST_RADIUS := 3.8
const HOMING_RANGE := 18.0


static func update_projectiles(w: SimWorld, dt: float) -> void:
	var live: Array[Dictionary] = []
	for p in w.projectiles:
		if _step_projectile(w, p, dt):
			live.append(p)
	w.projectiles = live


## Moves one projectile. Returns false when it is spent.
static func _step_projectile(w: SimWorld, p: Dictionary, dt: float) -> bool:
	var explosive: bool = p.kind == &"grenade" or p.kind == &"rocket"
	if p.kind == &"rocket":
		_home(w, p, dt)
	var from: Vector2 = p.pos
	# Start the wall check a little behind the shot, but never behind its muzzle or its last bounce.
	var back: Vector2 = p.vel.normalized() * minf(minf(0.9, p.vel.length() * 0.018), p.free)
	p.free += p.vel.length() * dt
	p.pos += p.vel * dt
	p.travelled += p.vel.length() * dt
	p.ttl -= dt
	var progress: float = p.travelled / p.reach
	if p.kind != &"rocket" and progress > 0.62:
		p.vel *= maxf(0.0, 1.0 - dt * (5.0 + progress * 10.0))
	var speed_sq: float = p.vel.length_squared()
	if progress >= 1.0 or p.ttl <= 0.0 or speed_sq < 0.36 or (progress > 0.72 and speed_sq < 16.0):
		return _end(w, p, p.pos)
	if p.pos.length() > w.arena_radius:
		var inward: Vector2 = -p.pos.normalized()
		p.pos = p.pos.limit_length(w.arena_radius - 0.05)
		return _bounce(w, p, inward) or _end(w, p, p.pos)
	var ballistic: bool = p.kind == &"ballistic"
	var cell := w.grid.ray_cell(from - back, p.pos, ballistic)
	if cell.x >= 0:
		var soft: bool = p.kind == &"flame" and w.grid.material[cell.y * w.grid.size + cell.x] <= Defs.Mat.WAREHOUSE
		w.hit_cell(cell, 0.0 if soft else maxf(1.0, p.damage), p.owner)
		var impact := w.grid.ricochet_impact(from - back, p.pos, ballistic)
		var normal: Vector2 = impact.get("normal", -p.vel.normalized())
		p.pos = impact.get("point", from) + normal * 0.01
		return _bounce(w, p, normal) or _end(w, p, p.pos)
	# A bullet goes through a hedge, hurts it and keeps half its damage. It loses damage at the first hedge only.
	var leaf := w.grid.cell_of(p.pos)
	if ballistic and not p.hedged and w.grid.is_solid(leaf):
		if w.grid.material[leaf.y * w.grid.size + leaf.x] == Defs.Mat.HEDGE:
			w.hit_cell(leaf, p.damage, p.owner)
			p.damage *= 0.5
			p.hedged = true
	for u in w.units:
		if u.index == p.owner or u.team == p.team:
			continue
		var near := Geometry2D.get_closest_point_to_segment(u.pos, from, p.pos)
		var gap: float = near.distance_to(u.pos) - u.radius - p.radius
		if explosive and gap <= (1.2 if p.kind == &"rocket" else 0.0) + p.fuse:
			return _end(w, p, near)
		if not explosive and gap <= 0.0:
			Combat.damage(w, u, p.damage, p.owner, near, p.vel, &"shot", p.weapon)
			return false
	return true


static func _home(w: SimWorld, p: Dictionary, dt: float) -> void:
	var dir: Vector2 = p.vel.normalized()
	var best := HOMING_RANGE
	var target := Vector2.ZERO
	for u in w.units:
		var to: Vector2 = u.pos - p.pos
		if u.team != p.team and to.length() < best and dir.dot(to.normalized()) >= 0.2:
			best = to.length()
			target = to.normalized()
	if target != Vector2.ZERO:
		dir = dir.lerp(target, minf(0.14, 2.8 * dt)).normalized()
	p.vel = dir * (p.vel.length() + p.accel * dt)


## Reflects a grenade or a ricochet pellet off a surface. Returns false when the projectile cannot bounce.
static func _bounce(w: SimWorld, p: Dictionary, normal: Vector2) -> bool:
	if p.kind == &"grenade" and p.bounces > 0 and p.vel.length() >= 2.8:
		p.bounces -= 1
		p.vel = (p.vel.bounce(normal) * 0.58).rotated(w.rng.randf_range(-0.45, 0.45))
	elif p.kind == &"ballistic" and p.ricochets > 0 and p.vel.length() >= 4.0:
		p.ricochets -= 1
		p.vel = p.vel.bounce(normal) * 0.78
		p.damage *= 0.8
	else:
		return false
	p.free = 0.0
	w.emit(&"bounce", {pos = p.pos})
	return true


## Spends a projectile at a point. Always returns false.
static func _end(w: SimWorld, p: Dictionary, at: Vector2) -> bool:
	match p.kind:
		&"grenade":
			Combat.explode(w, at, BLAST_RADIUS, p.damage, p.owner, false, p.weapon)
		&"rocket":
			Combat.explode(w, at, BLAST_RADIUS * 1.4, p.damage, p.owner, false, p.weapon)
		&"flame":
			add_zone(w, at, p.owner, p.weapon)
	return false


## Throws the secondary of a unit when its cooldown is over.
static func throw_secondary(w: SimWorld, u: SimUnit) -> void:
	if u.secondary_cooldown > 0.0:
		return
	var molotov := u.secondary == &"molotov"
	var quick := not molotov and u.has_perk(&"proximity_grenades")
	var dir := u.aim.normalized()
	(
		w
		. throwables
		. append(
			{
				owner = u.index,
				team = u.team,
				molotov = molotov,
				pos = u.pos + dir * (u.radius + 0.4),
				vel = dir * (15.0 if molotov else 30.0 if quick else 20.0),
				ttl = 0.78 if molotov else 1.5,
				bounces = 2,
				fuse = quick,
			}
		)
	)
	u.secondary_cooldown = Defs.MOLOTOV_COOLDOWN if molotov else Defs.GRENADE_COOLDOWN
	u.secondary_cooldown_max = u.secondary_cooldown
	w.emit(&"throw", {unit = u.index, molotov = molotov})


static func update_throwables(w: SimWorld, dt: float) -> void:
	var live: Array[Dictionary] = []
	for t in w.throwables:
		if _step_throwable(w, t, dt):
			live.append(t)
	w.throwables = live


static func _step_throwable(w: SimWorld, t: Dictionary, dt: float) -> bool:
	var radius := 0.3 if t.molotov else 0.36
	var from: Vector2 = t.pos
	t.pos += t.vel * dt
	t.vel *= maxf(0.0, 1.0 - (0.55 if t.molotov else 0.18) * dt)
	t.ttl -= dt
	var landed: bool = t.ttl <= 0.0 or t.pos.length() > w.arena_radius - radius
	var cell := w.grid.ray_cell(from, t.pos)
	if cell.x >= 0:
		w.hit_cell(cell, 1.5 if t.molotov else 3.0, t.owner)
		var impact := w.grid.ricochet_impact(from, t.pos)
		var normal: Vector2 = impact.get("normal", -t.vel.normalized())
		t.pos = impact.get("point", from) + normal * 0.01
		if t.molotov or t.bounces <= 0:
			landed = true
		else:
			# As in the original: the wall keeps 58% of the speed into it and 78% of the speed along it, and a slow
			# grenade explodes at its next wall.
			var along: Vector2 = t.vel.slide(normal)
			t.vel = along * 0.78 - t.vel.project(normal) * 0.58
			t.bounces = t.bounces - 1 if t.vel.length() >= 2.8 else 0
	for u in w.units:
		if u.team == t.team:
			continue
		var gap: float = u.pos.distance_to(t.pos) - u.radius - radius
		if gap <= 0.0 and not t.molotov:
			Combat.damage(w, u, 20.0, t.owner, t.pos, t.vel, &"shot", &"grenade")
		landed = landed or gap <= (1.25 if t.fuse else 0.0)
	if not landed:
		return true
	if t.molotov:
		add_zone(w, t.pos, t.owner, &"molotov")
	else:
		Combat.explode(w, t.pos, BLAST_RADIUS, 0.0, t.owner, true, &"grenade")
	return false


## Adds the fire of a weapon. A molotov fire is wide. The flame patch of other weapons is small and scorches flowers.
static func add_zone(w: SimWorld, at: Vector2, source: int, weapon: StringName) -> void:
	# Fire does not burn on water.
	if w.map.tile_at(at) == TerrainMap.Tile.WATER:
		return
	var flame := weapon != &"molotov"
	var zone := {pos = at, owner = source, flame = flame, radius = 1.12 if flame else 2.9, weapon = weapon}
	zone.merge({life = 3.0 if flame else 2.2, every = 1.0 if flame else 0.22, tick = 0.0})
	w.zones.append(zone)
	if w.zones.size() > 36:
		w.zones.pop_front()
	w.emit(&"zone", zone)


static func update_zones(w: SimWorld, dt: float) -> void:
	for z in w.zones:
		z.life -= dt
		z.tick -= dt
		if z.tick > 0.0:
			continue
		z.tick = z.every
		if z.flame:
			w.flowers.scorch(z.pos, z.radius)
		var owner: SimUnit = w.units[z.owner]
		for u in w.units:
			if (u == owner or u.team != owner.team) and u.pos.distance_to(z.pos) <= z.radius + u.radius:
				Combat.damage(w, u, 1.0, z.owner, u.pos, u.pos - z.pos, &"zone", z.weapon)
	w.zones = w.zones.filter(func(z: Dictionary) -> bool: return z.life > 0.0)
