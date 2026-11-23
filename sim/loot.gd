class_name Loot
## Weapon and perk pickups, and the loot boxes that drop them.

const THROW_SPEED := 24.0
const THROW_DRAG := 3.1
const THROW_STOP_SPEED := 2.2
const BOX_INTERVAL := Vector2(14.0, 3.0)
const HIGH_TIER_CHANCE := Vector2(0.07, 0.5)


static func spawn_weapon(w: SimWorld, at: Vector2, high_tier_chance: float, force := false) -> void:
	var high_tier := w.rng.randf() < high_tier_chance
	var pool := Defs.HIGH_TIER if high_tier else Defs.LOOTABLE
	# The flamethrower is in the loot pool only in the second half of the match.
	var count := pool.size() if high_tier or w.time_left <= w.duration * 0.5 else 2
	_add(w, {kind = &"weapon", id = pool[w.rng.randi() % count], pos = at, high_tier = high_tier}, force)


static func spawn_perk(w: SimWorld, at: Vector2) -> void:
	var ids: Array = Defs.PERKS.keys()
	_add(w, {kind = &"perk", id = ids[w.rng.randi() % ids.size()], pos = at, high_tier = false}, true)


static func _add(w: SimWorld, pickup: Dictionary, force: bool) -> void:
	pickup.merge({vel = Vector2.ZERO, thrower = -1, order = w.pickup_seq})
	w.pickup_seq += 1
	if w.pickups.size() >= Defs.PICKUP_CAPACITY:
		if not force:
			return
		# A forced pickup replaces the oldest of the least valuable kind.
		var worst := 0
		for i in w.pickups.size():
			if _priority(w.pickups[i]) < _priority(w.pickups[worst]):
				worst = i
		w.pickups.remove_at(worst)
	w.pickups.append(pickup)


static func _priority(pickup: Dictionary) -> int:
	return (2 if pickup.kind == &"perk" else 1 if pickup.high_tier else 0) * 100000 + pickup.order


## Drops a loot box on a free cell of the arena.
static func spawn_box(w: SimWorld) -> void:
	for attempt in 32:
		var at := w.random_point(w.arena_radius * 0.8)
		var cell := w.grid.cell_of(at)
		if w.grid.circle_hits(w.grid.center_of(cell), 1.2) or w.unit_near(w.grid.center_of(cell), 1.5):
			continue
		w.grid.set_cell(cell, Defs.Mat.BOX, w.rng.randf() < w.high_tier_chance())
		w.emit(&"box", {cell = cell})
		return


static func update(w: SimWorld, dt: float) -> void:
	w.box_timer -= dt
	if w.box_timer <= 0.0:
		spawn_box(w)
		w.box_timer = lerpf(BOX_INTERVAL.x, BOX_INTERVAL.y, w.loot_progress())
	for i in range(w.pickups.size() - 1, -1, -1):
		var p := w.pickups[i]
		if p.pos.length() > w.arena_radius - Defs.PICKUP_RADIUS:
			w.pickups.remove_at(i)
			continue
		if p.vel == Vector2.ZERO:
			continue
		var next: Vector2 = p.pos + p.vel * dt
		if w.grid.circle_hits(next, Defs.PICKUP_RADIUS):
			p.vel = Vector2.ZERO
			continue
		p.pos = next
		for u in w.units:
			if (
				p.thrower >= 0
				and u.team != w.units[p.thrower].team
				and u.pos.distance_to(p.pos) <= Defs.PICKUP_RADIUS + u.radius
			):
				Combat.damage(w, u, 1.0, p.thrower, u.pos, p.vel, &"pickup")
				p.vel = Vector2.ZERO
				break
		p.vel *= clampf(1.0 - THROW_DRAG * dt, 0.0, 1.0)
		if p.vel.length() <= THROW_STOP_SPEED:
			p.vel = Vector2.ZERO
			p.thrower = -1


## Gives the unit the first pickup it touches and can use.
static func collect(w: SimWorld, u: SimUnit) -> void:
	for i in w.pickups.size():
		var p := w.pickups[i]
		if p.vel != Vector2.ZERO or u.pos.distance_to(p.pos) > u.radius + Defs.PICKUP_RADIUS:
			continue
		if p.kind == &"perk":
			if not Arsenal.apply_perk(u, p.id):
				continue
			w.pickups.remove_at(i)
		else:
			if not Arsenal.can_collect(u, p.id):
				continue
			var ejected := Arsenal.equip(u, p.id, Defs.pickup_ammo(p.id))
			w.pickups.remove_at(i)
			if ejected != &"" and ejected != &"pistol":
				# The old weapon flies out behind the unit and hurts the first enemy it hits.
				var back := -u.aim.normalized()
				var at := u.pos + back * (u.radius + Defs.PICKUP_RADIUS + 0.5)
				_add(w, {kind = &"weapon", id = ejected, pos = at, high_tier = ejected in Defs.HIGH_TIER}, true)
				w.pickups[-1].vel = back * THROW_SPEED
				w.pickups[-1].thrower = u.index
		w.emit(&"pickup", {unit = u.index, kind = p.kind, id = p.id, pos = p.pos})
		return
