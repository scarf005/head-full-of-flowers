class_name Bots
## Bot brain: writes the input fields of a unit each tick.


static func think(w: SimWorld, u: SimUnit, _dt: float) -> void:
	var target: SimUnit = null
	for other in w.units:
		if other.team != u.team and (target == null or other.pos.distance_to(u.pos) < target.pos.distance_to(u.pos)):
			target = other
	if target == null:
		return
	var to := target.pos - u.pos
	u.aim = to.normalized()
	u.move = u.aim if to.length() > 8.0 else u.aim.orthogonal()
	u.want_fire = to.length() < (32.0 if w.hard else 19.0)
