class_name Trails
extends MultiMeshInstance3D
## Streaks behind shots and thrown things, and smoke puffs behind rockets, as in the original. Each part is written
## one time at its start. The shader moves a part and fades it by its age.

const CAPACITY := 4096
## Numbers of one part in the buffer of the multimesh: a transform of 12, a colour of 4 and custom data of 4.
const FLOATS := 20
## Metres of flight between two parts, and the speed in m/s and the most of the speed factor of each look.
const SPACING := {&"bullet": 0.08, &"flame": 0.1, &"rocket": 0.09, &"grenade": 0.09, &"molotov": 0.12}
const FULL_SPEED := {&"bullet": 44.0, &"flame": 24.0, &"rocket": 18.0, &"grenade": 20.0, &"molotov": 20.0}
const TOP_FACTOR := {&"bullet": 2.0, &"flame": 2.0, &"rocket": 2.0, &"grenade": 1.5, &"molotov": 1.5}
## Below this speed in m/s a thing leaves no trail.
const SLOWEST := {&"bullet": 0.08, &"flame": 0.08, &"rocket": 0.08, &"grenade": 0.18, &"molotov": 0.18}
## Streak of each look at the speed factor sf: length a + b sf, width a + b sf, colour, alpha, life a + b sf.
const STREAKS := {
	&"bullet": [Vector2(0.34, 0.22), Vector2(0.112, 0.04), Color("ffe6aa"), 0.22, Vector2(0.14, 0.08)],
	&"flame": [Vector2(0.2, 0.18), Vector2(0.34, 0.096), Color("ffd8af"), 0.4, Vector2(0.11, 0.05)],
	&"grenade": [Vector2(0.22, 0.2), Vector2(0.348, 0.144), Color("f7faee"), 0.54, Vector2(0.16, 0.07)],
	&"molotov": [Vector2(0.18, 0.15), Vector2(0.396, 0.108), Color("ffd2a2"), 0.42, Vector2(0.13, 0.05)],
}
const BULLET := Color("ffe6aa")
const SMOKE: Array[Color] = [Color("30363d"), Color("1f252b")]
const END_SMOKE: Array[Color] = [Color("2b3238"), Color("1c2228")]

## Ground in metres that the view shows. A thing outside it gets no parts.
var seen := Rect2(-1e6, -1e6, 2e6, 2e6)

var _next := 0
var _material := ShaderMaterial.new()
## All parts. A part with life 0 does not show.
var _buffer := PackedFloat32Array()
var _dirty := false


func _init() -> void:
	multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.use_custom_data = true
	multimesh.mesh = QuadMesh.new()
	multimesh.instance_count = CAPACITY
	_buffer.resize(CAPACITY * FLOATS)
	custom_aabb = AABB(Vector3(-60, -2, -60), Vector3(120, 10, 120))
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_material.shader = preload("res://shaders/trail.gdshader")
	# Over the units and under the shots.
	_material.render_priority = 2
	material_override = _material


## Number of parts that were added since the start.
func added() -> int:
	return _next


## Part in `slot`: {at, dir, length, width, growth, color, life, puff, born}.
func part(slot: int) -> Dictionary:
	var f := _buffer.slice(slot * FLOATS, (slot + 1) * FLOATS)
	var shape := {dir = Vector2(f[0], f[4]), length = f[8], width = f[1], growth = f[5], born = f[10]}
	return shape.merged(
		{at = Vector3(f[3], f[7], f[11]), color = Color(f[12], f[13], f[14], f[15]), life = f[16], puff = f[17] > 0.5}
	)


## Shows each part as it is at the match time `now`.
func show_at(now: float) -> void:
	_material.set_shader_parameter(&"now", now)
	if _dirty:
		multimesh.buffer = _buffer
		_dirty = false


## Adds the parts behind a thing that flew from the match time `from` to `now`. At `now` the thing is at `at` with the
## velocity `vel` and it has flown for `flown` seconds. `look` is a key of SPACING. `arc` gives the height of the
## thing `age` seconds before `now`. The parts sit on a grid of match time, so a fast screen adds no more parts.
func follow(
	look: StringName, at: Vector3, vel: Vector2, flown: float, from: float, now: float, arc := Callable()
) -> void:
	var speed := vel.length()
	if speed <= SLOWEST[look] or not seen.has_point(Vector2(at.x, at.z)):
		return
	var every: float = SPACING[look] / speed
	var factor := clampf(speed / FULL_SPEED[look], 0.0, TOP_FACTOR[look])
	for k in range(floori(maxf(from, now - flown) / every) + 1, floori(now / every) + 1):
		var age := now - k * every
		var head := at - Vector3(vel.x, 0.0, vel.y) * age
		if arc.is_valid():
			head.y = arc.call(age)
		_sample(look, head, vel / speed, factor, now - age)


## Adds the last parts of a thing that stops at `at` at the match time `now`.
func end(look: StringName, at: Vector3, vel: Vector2, now: float) -> void:
	var speed := vel.length()
	if speed <= SLOWEST[look] or not seen.has_point(Vector2(at.x, at.z)):
		return
	var dir := vel / speed
	var back := Vector3(dir.x, 0.0, dir.y)
	match look:
		&"bullet":
			for n in 2:
				_streak(at - back * n * 0.22, dir, 0.42 - n * 0.12, 0.152, BULLET, 0.76 - n * 0.22, 0.1 + n * 0.03, now)
		&"flame":
			_streak(at, dir, 0.2, 0.4, Color("ffd4a8"), 0.32, 0.09, now)
		&"grenade":
			_streak(at, dir, 0.7, 0.54, Color("f5f8ea"), 0.5, 0.16, now)
		&"molotov":
			_streak(at, dir, 0.46, 0.6, Color("ffd2a2"), 0.4, 0.12, now)
		&"rocket":
			for n in 3:
				var side := dir.orthogonal() * randf_range(-1.0, 1.0) * (0.1 + n * 0.05)
				var from := at - back * n * 0.72 + Vector3(side.x, 0.0, side.y)
				var fly := (-dir + dir.orthogonal() * randf_range(-0.32, 0.32)).normalized()
				var grow := Vector3(0.36, randf_range(0.62, 1.24), randf_range(2.2, 4.8))
				var drift := Vector2(randf_range(0.5, 1.35), randf_range(0.52, 1.08))
				_puff(from, fly, grow, drift, END_SMOKE[mini(n, 1)], 0.72 - n * 0.06, 0.22 + n * 0.07, now)


## One sample of the trail: a streak, or for a rocket a few smoke puffs that drift back from the rocket.
func _sample(look: StringName, head: Vector3, dir: Vector2, sf: float, born: float) -> void:
	if look != &"rocket":
		var s: Array = STREAKS[look]
		var at_sf := func(v: Vector2) -> float: return v.x + v.y * sf
		_streak(head, dir, at_sf.call(s[0]), at_sf.call(s[1]), s[2], s[3], at_sf.call(s[4]), born)
		return
	for n in int(Tune.smoke_puffs):
		var side := dir.orthogonal() * randf_range(-1.0, 1.0) * (0.08 + sf * 0.03)
		var back := -dir * randf_range(0.1, 0.44) * 4.0 + side
		var spread := 0.24 + sf * 0.08
		var fly := (-dir + dir.orthogonal() * randf_range(-spread, spread)).normalized()
		var core := randf() > 0.45
		var width := (0.12 + sf * (0.04 if core else 0.03)) * 4.0 * 0.75
		var drift := Vector2(randf_range(0.62, 2.1) + sf * 0.95, randf_range(0.55, 1.15))
		var grow := Vector3(width, randf_range(0.65, 1.35), randf_range(1.8, 4.4))
		var life := 0.24 + sf * randf_range(0.08, 0.16)
		var from := head + Vector3(back.x, 0.0, back.y)
		_puff(from, fly, grow, drift, SMOKE[int(not core)], 0.78 if core else 0.66, life, born)


## A streak that ends at `head` and lies `length` metres back along `dir`.
func _streak(
	head: Vector3, dir: Vector2, length: float, width: float, color: Color, alpha: float, life: float, born: float
) -> void:
	var basis := Basis(Vector3(dir.x, dir.y, length), Vector3(width * Tune.trail_width, 0.0, 0.0), Vector3(0, 0, born))
	_add(head, basis, Color(color, alpha * Tune.trail_alpha), life * Tune.trail_length, false)


## A smoke puff that starts at `from` and moves along `dir`. `grow`: width in metres, growth in metres per second
## and turbulence. `drift`: speed in m/s and drag in m/s².
func _puff(
	from: Vector3, dir: Vector2, grow: Vector3, drift: Vector2, color: Color, alpha: float, life: float, born: float
) -> void:
	var size := Vector3(grow.x * Tune.smoke_size, grow.y * Tune.smoke_size, grow.z)
	var basis := Basis(Vector3(dir.x, dir.y, 0.0), size, Vector3(drift.x, drift.y, born))
	_add(from, basis, Color(color, alpha), life * Tune.smoke_life, true)


## Writes one part over the oldest part. The shader reads the numbers of the part from the columns of `basis`.
func _add(at: Vector3, basis: Basis, color: Color, life: float, puff: bool) -> void:
	var i := _next % CAPACITY * FLOATS
	for row in 3:
		_buffer[i + row * 4] = basis.x[row]
		_buffer[i + row * 4 + 1] = basis.y[row]
		_buffer[i + row * 4 + 2] = basis.z[row]
		_buffer[i + row * 4 + 3] = at[row]
	_buffer[i + 12] = color.r
	_buffer[i + 13] = color.g
	_buffer[i + 14] = color.b
	_buffer[i + 15] = clampf(color.a, 0.0, 1.0)
	_buffer[i + 16] = life
	_buffer[i + 17] = float(puff)
	_next += 1
	_dirty = true
