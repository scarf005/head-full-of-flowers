class_name GameView
extends Node3D
## Runs one match: steps the simulation, feeds player input and draws the state.

signal event(data: Dictionary)

## Shots fly at the height of the drawn gun.
const SHOT_HEIGHT := UnitView.HAND / UnitView.PX_PER_M / cos(CameraRig.PITCH)
## Flames of a fire for each square metre, and the most flames of one fire.
const FLAMES_PER_M2 := 1.2
const MOST_FLAMES := 56
## Seconds in which a fire spreads from its middle to its rim, and in which it dies from its rim to its middle.
const FIRE_SPREAD := 0.45
const FIRE_END := 0.5
## Width and height in pixels of a flame of size 1.
const FLAME := Vector2(12.0, 20.0)
## Size in pixels of a shape that shows item art at its drawn size, and at half of it.
const ART := Vector2(48.0, 48.0)
const SMALL_ART := Vector2(24.0, 24.0)
const INK := Color(0.2, 0.14, 0.2)
const FIRE: Array[Color] = [Color.WHITE, Color("ffe680"), Color("ff9a3c"), Color("e2552a")]
## Instance colours of a blast shape: a ball of fire, and smoke only.
const HOT: Array[Color] = [Color.WHITE]
const COLD: Array[Color] = [Color.BLACK]
## Camera shake of a blast by weapon: x is the amount, y is the most that the shake reaches.
const BLAST_SHAKE := {
	&"grenade": Vector2(0.55, 1.4), &"grenade-launcher": Vector2(0.24, 1.6), &"rocket-launcher": Vector2(0.42, 2.4)
}

## Game seconds from the drawn frame to the last tick. The sim ticks at 60 Hz and screens draw faster.
static var lag := 0.0
## Mouse pointer in root canvas units, from the last mouse event. A query of the pointer in each frame is a round
## trip to the display server.
static var mouse := Vector2.ZERO
## True while the pointer is on a panel. The player then does not fire or throw.
static var hold_fire := false

var world: SimWorld
var camera := CameraRig.new()
var player: SimUnit
## Bots drive the player unit too. Used for demos and captures.
var autoplay := false
var shake := 0.0
## Seconds left of the opening, in which the camera closes in.
var intro := 0.0
## Screen tint for the post pass. Alpha is the strength and fades out.
var tint := Color(0, 0, 0, 0)
## True from the last right stick aim until the mouse moves.
var _stick_aim := false
## Deaths of the player at the last tick.
var _deaths := 0
## Action -> true while a person holds its key since before the last death of the player.
var _stale := {&"fire": false, &"throw": false}
var _kick := Vector2.ZERO
var _jitter := Vector2.ZERO
## Unit index -> the damage number that shows over it.
var _numbers := {}
var _bits := Bits.new()
var _units: Array[UnitView] = []
var _focus := Vector2.ZERO
## Flat pixel shapes on the ground, under the units: rings, fire glow and shadows.
var _ground := Fx.new(0)
## Streaks behind shots and thrown things, and rocket smoke. Over the units.
var _trails := Trails.new()
## Flat pixel shapes over the units and the trails: shots, thrown things, flames, sparks, blasts and pickups.
var _air := Fx.new(3)
## 3D models of the rockets in flight.
var _rockets := Rockets.new()
## Bodies of killed units in flight.
var _ragdolls := Ragdolls.new()
var _terrain: TerrainView
var _scorch := Scorch.new()
## Vector2i(number of flames, number of the fire) -> the places of the flames. See _fire_spots.
var _spots := {}
## Match time to which the fires gave their embers and smoke.
var _fire_time := 0.0
var _lights := 0
## Match time that the last frame showed. Each frame adds the trail parts from this time to its own time.
var _drawn := 0.0


func setup(config: Dictionary) -> void:
	world = SimWorld.new(config)
	player = world.units[0]
	_focus = player.pos
	add_child(camera)
	add_child(Quality.sun())
	var env := WorldEnvironment.new()
	env.environment = Quality.environment()
	add_child(env)
	_terrain = TerrainView.new()
	_terrain.setup(world)
	add_child(_terrain)
	_scorch.setup(world.map.size)
	add_child(_scorch)
	var grass := GrassView.new()
	grass.setup(world)
	add_child(grass)
	var flowers := FlowerView.new()
	flowers.setup(world)
	add_child(flowers)
	for u in world.units:
		var view := UnitView.new()
		view.setup(u, world.team_color(u.team))
		view.map = world.map
		add_child(view)
		_units.append(view)
	add_child(_bits)
	add_child(_ground)
	add_child(_trails)
	add_child(_air)
	add_child(_rockets)
	add_child(_ragdolls)


func _physics_process(_delta: float) -> void:
	if world == null:
		return
	# The shake is a new random offset each tick. It fades in game time, so it also fades after the end.
	var real := Defs.TICK * Tune.game_speed
	shake = maxf(0.0, shake - real * 4.4)
	_jitter = Vector2(randf_range(-0.34, 0.34), randf_range(-0.28, 0.28)) * pow(minf(shake, 4.2), 1.08) * Tune.shake
	_kick *= maxf(0.0, 1.0 - real * 8.5)
	if world.finished:
		pass
	elif autoplay:
		Bots.think(world, player, real)
	else:
		_read_input()
	# After the end, the tick sets the step of the match to 0, so the view draws each thing on its last place.
	world.tick()
	for e in world.events:
		_show(e)
		event.emit(e)
	world.events.clear()


func _unhandled_input(input: InputEvent) -> void:
	# In a match of bots only, a bot controls unit 0.
	if player == null or autoplay:
		return
	if input is InputEventMouseMotion:
		_stick_aim = false
	if input.is_action_pressed(&"swap_next"):
		player.want_swap += 1
	elif input.is_action_pressed(&"swap_prev"):
		player.want_swap -= 1
	elif input.is_action_pressed(&"reload"):
		player.want_reload = true


func _process(delta: float) -> void:
	if world == null:
		return
	RenderingServer.global_shader_parameter_set(&"match_time", world.now)
	RenderingServer.global_shader_parameter_set(&"arena_radius", world.arena_radius)
	for id: StringName in Tune.LOOK:
		RenderingServer.global_shader_parameter_set(id, Tune.read(id))
	var behind := 1.0 - Engine.get_physics_interpolation_fraction()
	lag = behind * Defs.TICK * Tune.game_speed * float(world.step > 0.0)
	var shot_lag := behind * world.step
	# The view follows the player only. A view that also follows the pointer moves the ground under a still pointer.
	_focus = _focus.lerp(player.pos - player.vel * lag, clampf(delta * Tune.camera_follow, 0.0, 1.0))
	intro = maxf(0.0, intro - delta)
	tint.a = maxf(0.0, tint.a - delta * 2.5)
	var rest := camera.rest_size()
	camera.size = lerpf(camera.size, rest, clampf(delta * 6.0, 0.0, 1.0))
	if absf(camera.size - rest) < 0.02:
		camera.size = rest
	if intro > 0.0:
		camera.size = rest + intro * intro * 14.0
	camera.target = _focus + _kick + _jitter
	camera.apply()
	# Trail parts only on the ground that the view shows, and 4 m around it.
	var corner := camera.ground_point(Vector2.ZERO)
	_trails.seen = Rect2(corner, camera.ground_point(get_viewport().get_visible_rect().size) - corner).grow(4.0)
	_draw_shots(shot_lag)
	_draw_throwables(shot_lag)
	_draw_zones()
	_draw_pickups()
	_draw_lasers()
	_ground.step(delta)
	_air.step(delta)
	_ragdolls.step(delta, world.grid)
	# A hit stop makes the step shorter and so the lag. The drawn time stays where it was, so no part comes twice.
	_drawn = maxf(_drawn, world.now - shot_lag)
	_trails.show_at(_drawn)


## Steady pseudo-random number in 0..1 for a point.
static func _hash(p: Vector2) -> float:
	return fposmod(sin(p.dot(Vector2(12.9898, 78.233))) * 43758.5453, 1.0)


## Sim position under the mouse pointer, at the height where shots fly, so that a pointer on the body of a unit
## aims at that unit.
func pointer() -> Vector2:
	var root := get_tree().root
	var scale := Vector2(get_viewport().get_visible_rect().size) / root.get_visible_rect().size
	return camera.ground_point(mouse * scale, SHOT_HEIGHT)


## Where the HUD draws the crosshair, in root canvas units: the mouse pointer, or a point ahead of the player while
## the right stick aims.
func crosshair() -> Vector2:
	var root := get_tree().root
	if not _stick_aim:
		return mouse
	var ahead := player.pos + player.aim * 5.0
	var scale := root.get_visible_rect().size / Vector2(get_viewport().get_visible_rect().size)
	return camera.unproject_position(Vector3(ahead.x, SHOT_HEIGHT, ahead.y)) * scale


func _read_input() -> void:
	player.move = Input.get_vector(&"move_left", &"move_right", &"move_up", &"move_down")
	var stick := Input.get_vector(&"aim_left", &"aim_right", &"aim_up", &"aim_down")
	var to_pointer := pointer() - player.pos
	if stick.length() > 0.3:
		player.aim = stick.normalized()
		_stick_aim = true
	elif not _stick_aim and to_pointer.length() > 0.05:
		player.aim = to_pointer.normalized()
	# A key that a person holds through the death of the player starts nothing in the new life. The respawn makes
	# the weapon and the grenade ready, so the held key would fire or throw at the respawn place.
	for action: StringName in _stale:
		_stale[action] = (_stale[action] or player.deaths != _deaths) and Input.is_action_pressed(action)
	_deaths = player.deaths
	player.want_fire = Input.is_action_pressed(&"fire") and not hold_fire and not _stale[&"fire"]
	player.want_throw = Input.is_action_pressed(&"throw") and not hold_fire and not _stale[&"throw"]


func _show(e: Dictionary) -> void:
	# In a match of bots only, unit 0 gets no camera shake, tint or damage numbers.
	var me := -1 if autoplay else 0
	match e.type:
		&"shot":
			var at: Vector2 = e.pos + UnitView.muzzle(e.dir, e.weapon)
			_flash(Vector3(at.x, 0.8, at.y), Color(1.0, 0.8, 0.4), 2.5, 0.06)
			_pop(at, Color(1.0, 0.85, 0.4), 0.9, 0.05, Fx.turn_of(e.dir))
			if e.weapon != &"flamethrower":
				var side: Vector2 = -e.dir.orthogonal() * randf_range(1.5, 3.0)
				_bits.add(
					Vector3(e.pos.x, 0.7, e.pos.y), Vector3(side.x, 3.5, side.y), Color(0.95, 0.75, 0.25), 0.07, 0.9
				)
			if e.unit == me:
				shake = minf(1.3, shake + 0.1)
		&"throw":
			if e.unit == me:
				shake = minf(1.2, shake + 0.15)
		&"vault":
			_puff(world.units[e.unit].pos, Color(0.78, 0.74, 0.66), 6, 2.5, -e.dir)
		&"hit":
			var color := world.team_color(e.team)
			_puff(e.pos, color, 40 if e.kill else 8, 7.0 if e.kill else 4.5, e.dir)
			_pop(e.pos, Color.WHITE, 1.6 if e.kill else 1.0, 0.07)
			if e.kill:
				_ring(e.pos, color, 2.4, 0.3)
				var target := world.units[e.target]
				_ragdolls.throw(e.target_pos, e.dir, e.damage, target.radius, world.team_color(target.team))
				# As in the original game, a green number over a unit shows the hit points of its kill.
				if not autoplay and e.source >= 0 and e.source != e.target and Tune.kill_hp > 0.0:
					var at: Vector2 = world.units[e.source].pos
					_number("heal %d" % e.source, at, Tune.kill_hp, Color("a9ffbb"), "+%d HP")
			if not autoplay:
				_number(e.target, e.pos, e.damage, Color(1.0, 0.4, 0.4) if e.target == me else Color.WHITE)
			# A kill by the player shakes the view 5 times as hard as a hit.
			if e.target == me:
				shake = minf(3.0, shake + 0.66)
				tint = Color(0.85, 0.05, 0.12, 0.55)
				_kick -= e.dir.normalized() * 0.14
			elif e.source == me:
				shake = minf(2.8, shake + (2.4 if e.kill else 0.48))
				_kick += e.dir.normalized() * 0.1
		&"cell":
			var at := world.grid.center_of(e.cell)
			_puff(at, TerrainView.CELL_LOOK[mini(e.material, 7)][0], 14 if e.destroyed else 3, 4.0)
			_pop(at, Color.WHITE, 0.7, 0.05)
		&"door":
			_terrain.door(e)
		&"glass":
			_terrain.break_glass(e.cell)
			_puff(world.grid.center_of(e.cell), TerrainView.GLASS, 10, 5.0)
		&"explosion":
			_flash(Vector3(e.pos.x, 1.0, e.pos.y), Color(1.0, 0.6, 0.25), e.radius * 2.5, 0.35)
			_burst(e.pos, e.radius)
			_puff(e.pos, Color(0.22, 0.2, 0.2), 18, 8.0)
			_scorch.crater(e.pos, e.radius * Tune.crater_size)
			# Full shake within 10 m of the player, none from 34 m.
			var near := clampf((34.0 - e.pos.distance_to(player.pos)) / 24.0, 0.0, 1.0)
			var blast: Vector2 = BLAST_SHAKE.get(e.weapon, BLAST_SHAKE[&"grenade"])
			shake = minf(maxf(shake, blast.y), shake + blast.x * near)
		&"box":
			_terrain.add_box(e.cell)
		&"zone":
			_scorch.burn(e.pos, e.radius, Scorch.ZONE_CHAR)
		&"burnt":
			_scorch.burn(e.pos, Scorch.CELL_REACH, 1.0)
		&"respawn":
			_units[e.unit].grow = 0.2
			_ring(e.pos, world.team_color(world.units[e.unit].team), 1.3, 0.25)
		&"pickup":
			_ring(e.pos, Color(1.0, 0.9, 0.4), 1.1, 0.2)
		&"spent":
			# The trail goes on to the place where the shot stops, and that place gets the last parts.
			var at := Vector3(e.pos.x, SHOT_HEIGHT, e.pos.y)
			var look := _look_of(e.kind)
			_trails.follow(look, at, e.vel, e.travelled / maxf(e.vel.length(), 0.001), _drawn, world.now)
			_trails.end(look, at, e.vel, world.now)
		&"landed":
			var look := &"molotov" if e.molotov else &"grenade"
			var at := Vector3(e.pos.x, _arc(e.ttl), e.pos.y)
			var arc := func(age: float) -> float: return _arc(e.ttl + age)
			_trails.follow(look, at, e.vel, e.flown, _drawn, world.now, arc)
			_trails.end(look, at, e.vel, world.now)


## Ring on the ground that widens to `radius` metres and goes away.
func _ring(at: Vector2, color: Color, radius: float, seconds: float) -> void:
	var size := _on_ground(radius)
	var more := {hole = Vector2(0.6, 0.94)}
	_ground.spawn(Vector3(at.x, 0.0, at.y), seconds, Fx.Shape.DISC, size * 0.3, size, [color] as Array[Color], more)


## Size in pixels of a circle of `radius` metres that lies on the ground.
static func _on_ground(radius: float) -> Vector2:
	var wide := radius * 2.0 * UnitView.PX_PER_M
	return Vector2(wide, wide * sin(CameraRig.PITCH))


func _flash(at: Vector3, color: Color, reach: float, seconds: float) -> void:
	if _lights >= Quality.light_budget():
		return
	_lights += 1
	var light := OmniLight3D.new()
	light.position = at
	light.light_color = color
	light.light_energy = 4.0
	light.omni_range = reach
	add_child(light)
	var tween := create_tween()
	tween.tween_property(light, "light_energy", 0.0, seconds)
	tween.tween_callback(
		func() -> void:
			_lights -= 1
			light.queue_free()
	)


## Spark with 4 points that shows for a few frames: muzzle flash or impact. `size` 1 is 18 pixels.
func _pop(at: Vector2, color: Color, size: float, seconds: float, turn := 0.0) -> void:
	var px := Vector2.ONE * size * 18.0
	var colors: Array[Color] = [Color.WHITE, color]
	_air.spawn(Vector3(at.x, SHOT_HEIGHT, at.y), seconds, Fx.Shape.SPARK, px, px * 0.6, colors, {turn = turn})


## Spray of small cubes that fall and bounce. `dir` pushes the spray one way.
func _puff(at: Vector2, color: Color, amount: int, speed: float, dir := Vector2.ZERO) -> void:
	for n in amount:
		var out := (dir + Vector2.from_angle(randf() * TAU) * 0.7) * speed * randf_range(0.3, 1.0)
		var up := randf_range(1.5, 5.5)
		_bits.add(
			Vector3(at.x, 0.7, at.y), Vector3(out.x, up, out.y), color, randf_range(0.07, 0.17), randf_range(0.5, 1.1)
		)


## Number over a unit that rises and goes away: the damage of a hit, or with `format` the hit points of a kill. A
## number with the same `key` while the first number shows adds to that number.
func _number(key: Variant, at: Vector2, amount: float, color: Color, format := "%d") -> void:
	# A typed variable cannot take a freed object, so test the stored value first.
	var label: Label3D = _numbers[key] if is_instance_valid(_numbers.get(key)) else null
	if label == null:
		label = Label3D.new()
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.no_depth_test = true
		# After the grass, the flowers, the units and the effects, which have a priority of 3 at most.
		label.outline_render_priority = 4
		label.render_priority = 5
		label.pixel_size = 0.06
		label.font_size = 16
		label.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		label.outline_size = 6
		label.modulate = color
		label.set_meta(&"total", 0.0)
		add_child(label)
		_numbers[key] = label
	var total: float = label.get_meta(&"total") + amount
	label.set_meta(&"total", total)
	label.text = format % int(total)
	# Above the health bar, which is at 2.7 m.
	label.position = Vector3(at.x, 3.4, at.y)
	label.scale = Vector3.ONE * 1.5
	if label.has_meta(&"tween"):
		label.get_meta(&"tween").kill()
	var tween := create_tween()
	label.set_meta(&"tween", tween)
	tween.tween_property(label, "scale", Vector3.ONE, 0.12)
	tween.parallel().tween_property(label, "position:y", 4.0, 0.6)
	tween.tween_callback(label.queue_free)


## Blast: smoke that rises, a ball of fire that cools to smoke, a thin ring on the ground that shows the reach, and
## embers that fly out.
func _burst(at: Vector2, radius: float) -> void:
	var px := radius * UnitView.PX_PER_M
	var ground := Vector3(at.x, 0.0, at.y)
	var age := {hole = Vector2(0.0, 1.0)}
	for n in 5:
		var out := Vector2.from_angle(randf() * TAU) * randf() * radius * 0.45
		var size := Vector2.ONE * px * randf_range(0.55, 0.85)
		var more := age.merged({vel = Vector3(out.x * 0.6, randf_range(1.1, 2.0), out.y * 0.6), turn = randf() * TAU})
		var from := ground + Vector3(out.x, Fx.up(size.y * 0.3), out.y)
		_air.spawn(from, randf_range(0.8, 1.2), Fx.Shape.BLAST, size * 0.6, size, COLD, more)
	for n in 4:
		# The first ball is in the middle and has the full size.
		var out := Vector2.from_angle(randf() * TAU) * radius * 0.4 * float(n > 0)
		var size := Vector2.ONE * px * (1.5 if n == 0 else randf_range(0.6, 0.9))
		var more := age.merged({vel = Vector3(0.0, 0.7, 0.0), turn = randf() * TAU})
		var from := ground + Vector3(out.x, Fx.up(size.y * 0.2), out.y)
		_air.spawn(from, 0.5 if n == 0 else randf_range(0.3, 0.45), Fx.Shape.BLAST, size * 0.6, size, HOT, more)
	for n in 14:
		var out := Vector2.from_angle(randf() * TAU) * randf_range(0.6, 1.5) * radius / 0.35
		var more := {vel = Vector3(out.x, randf_range(1.0, 5.0), out.y)}
		var size := Vector2.ONE * randf_range(3.0, 5.0)
		_air.spawn(ground + Vector3.UP * 0.5, randf_range(0.2, 0.4), Fx.Shape.DISC, size, size * 0.4, FIRE, more)
	var reach := _on_ground(radius)
	var ring := {hole = Vector2(0.88, 0.97), dots = 0.6}
	_ground.spawn(ground, 0.24, Fx.Shape.DISC, reach * 0.35, reach, [Color("ffe9b0")] as Array[Color], ring)


## Look of the trail of a projectile kind.
static func _look_of(kind: StringName) -> StringName:
	return kind if kind == &"flame" or kind == &"rocket" else &"bullet"


## Height in metres of a thrown thing that has `ttl` seconds of flight left.
static func _arc(ttl: float) -> float:
	return 0.4 + sin(clampf(ttl, 0.0, 1.5) / 1.5 * PI) * 1.2


## Shots: a teardrop that glows along the flight, yellow for the side of the player and red for the others, over its
## light on the ground, and a trail. The shell of the grenade launcher is a large shot. A rocket is a 3D model that
## turns around its length.
func _draw_shots(shot_lag: float) -> void:
	for i in world.projectiles.size():
		var p := world.projectiles[i]
		var ground := Vector3(p.pos.x - p.vel.x * shot_lag, 0.0, p.pos.y - p.vel.y * shot_lag)
		var at := ground + Vector3.UP * SHOT_HEIGHT
		var flown: float = p.travelled / maxf(p.vel.length(), 0.001) - shot_lag
		_trails.follow(_look_of(p.kind), at, p.vel, flown, _drawn, world.now - shot_lag)
		var color := Color(1.0, 0.8, 0.2) if p.team == world.units[0].team else Color(1.0, 0.3, 0.25)
		match p.kind:
			&"flame":
				# Fire art over a glow of dots that grows along the flight. The art flips 8 times per second.
				var glow: float = 10.0 + 14.0 * p.travelled / p.reach
				var flip := float((i + int(world.now * 8.0)) % 2) * 2.0
				# The web build keeps the time with 11 bits, so the time goes up and down in 2 s.
				var time := pingpong(world.now, 2.0)
				_air.add(at, Vector2(glow, glow) * 1.5, Fx.Shape.BLAST, Color(1.0, 0.58, 0.28), i, time, 1.0)
				_air.add(at, ART, Fx.Shape.ART, Color.WHITE, 0.0, Fx.cell(&"fire"), flip)
				_ground.add(ground, Vector2(glow, glow * 0.6), Fx.Shape.DISC, Color(1.0, 0.58, 0.28), 0.0, 0.0, 1.0)
			&"rocket":
				_rockets.add(at, p.vel, world.now * 6.0 + i)
				_ground.add(ground, Vector2(6.0, 4.0), Fx.Shape.DISC, INK, 0.0, 0.0, 1.0)
			_:
				var width: float = roundf(maxf(4.0, p.radius * 28.0))
				var length: float = width * 1.85 * clampf(p.vel.length() / 25.0, 1.1, 2.9)
				_air.add(at, Vector2.ONE * (length + 8.0), Fx.Shape.SHOT, color, Fx.turn_of(p.vel), width)
				var pool := width * 1.6 + 6.0
				_ground.add(ground, Vector2(pool, pool * 0.6), Fx.Shape.DISC, color, 0.0, 0.0, 1.0)
	_rockets.end_frame()


## Thrown grenades and fire bottles: the art turns in the air over a shadow and leaves a trail. A red ring shows the
## reach of a blast.
func _draw_throwables(shot_lag: float) -> void:
	for i in world.throwables.size():
		var t := world.throwables[i]
		var ground := Vector3(t.pos.x - t.vel.x * shot_lag, 0.0, t.pos.y - t.vel.y * shot_lag)
		var ttl: float = t.ttl + shot_lag
		var height := _arc(ttl)
		var look := &"molotov" if t.molotov else &"grenade"
		var arc := func(age: float) -> float: return _arc(ttl + age)
		var at := ground + Vector3.UP * height
		_trails.follow(look, at, t.vel, t.flown - shot_lag, _drawn, world.now - shot_lag, arc)
		var blink := fmod(world.now, 0.24) < 0.08
		var tint := Color.WHITE
		# No ring for a fire bottle: it burns where it lands, and that place is not known yet.
		if not t.molotov:
			# The blast hits a unit whose edge is in reach, so the ring is wider by the radius of a unit.
			var reach := _on_ground(Shots.BLAST_RADIUS + Defs.PLAYER_RADIUS)
			var red := Color(1.0, 0.3, 0.25) if blink else Color(0.7, 0.15, 0.15)
			_ground.add(ground, reach, Fx.Shape.DISC, red, 0.0, 1.0 - 4.0 / reach.x)
			tint = Color(1.0, 0.45, 0.4) if blink else Color.WHITE
		_ground.add(ground, Vector2(10.0, 6.0), Fx.Shape.DISC, INK, 0.0, 0.0, 1.0)
		_air.add(at, SMALL_ART, Fx.Shape.ART, tint, world.now * 9.0 + i, Fx.cell(look), 1.0)


## Fire on the ground and on burning cells.
func _draw_zones() -> void:
	for z in world.zones:
		_fire(z.pos, z.radius, z.full - z.life, z.life)
	for b: Dictionary in world.burning.values():
		_fire(world.grid.center_of(b.cell), 0.7, Tune.burn_time - b.left, b.left)
	_fire_time = world.now


## Fire of `radius` m that is `age` seconds old and has `left` seconds to burn: flames over a glow of dots with a
## ragged edge. The flames come up from the middle to the rim, each at its own place, and go out from the rim to
## the middle. Embers and smoke rise from the flames that burn. No line shows the rim.
func _fire(at: Vector2, radius: float, age: float, left: float) -> void:
	# As for the trails, no shapes for a fire outside the ground that the view shows.
	if not _trails.seen.grow(radius).has_point(at):
		return
	var seed := int(absf(at.x * 73.0 + at.y * 151.0)) % 64
	var ground := Vector3(at.x, 0.0, at.y)
	var reach := minf(0.3 + 0.8 * age / FIRE_SPREAD, minf(1.1, 0.25 + 0.85 * left / FIRE_END))
	var glow := _on_ground(radius * reach)
	_ground.add(ground, glow, Fx.Shape.BLAST, Color("f4782e"), seed, pingpong(world.now * 0.3, 1.0), 1.0)
	var spots := _fire_spots(clampi(ceili(radius * radius * PI * FLAMES_PER_M2), 4, MOST_FLAMES), seed)
	var burning: Array[Vector3] = []
	for spot: Array in spots:
		var far: float = spot[1]
		var grown := clampf((age - far * FIRE_SPREAD * 0.8 - spot[2] * 0.1) / 0.16, 0.0, 1.0)
		var alive := clampf((left - far * FIRE_END * 0.7) / 0.15, 0.0, 1.0)
		# A new flame is larger than its size for a moment.
		var swell := grown / 0.7 * 1.25 if grown < 0.7 else lerpf(1.25, 1.0, (grown - 0.7) / 0.3)
		var size: Vector2 = (
			FLAME * lerpf(1.3, 0.75, minf(far, 1.0)) * Vector2(0.8 + 0.5 * spot[2], 1.25 - 0.5 * spot[2])
		)
		size *= swell * alive
		if size.x < 3.0:
			continue
		var on: Vector2 = at + spot[0] * radius
		burning.append(Vector3(on.x, 0.5, on.y))
		_air.add(Vector3(on.x, Fx.up(size.y * 0.5 - 1.0), on.y), size, Fx.Shape.FLAME, Color.WHITE, spot[2] * TAU)
	# For each 0.1 s of match time: one ember from a fire of 4 m² or more, and from a smaller fire with a chance
	# of its share of 4 m². One smoke puff with the ember of each third 0.1 s.
	var share := radius * radius * PI / 4.0
	for k in range(floori(_fire_time * 10.0) + 1, floori(world.now * 10.0) + 1):
		if burning.is_empty() or _hash(Vector2(k, seed)) >= share:
			continue
		var from := burning[k * 7 % burning.size()]
		var more := {vel = Vector3(randf_range(-0.6, 0.6), randf_range(2.0, 3.5), 0.0)}
		_air.spawn(from, randf_range(0.4, 0.7), Fx.Shape.DISC, Vector2(3.0, 3.0), Vector2(2.0, 2.0), FIRE, more)
		if k % 3 == 0:
			var size := Vector2.ONE * randf_range(14.0, 22.0)
			var rise := {vel = Vector3(0.5, randf_range(1.4, 2.2), 0.0), hole = Vector2(0.3, 1.0), turn = randf() * TAU}
			_air.spawn(from + Vector3.UP * 0.6, randf_range(0.6, 0.9), Fx.Shape.BLAST, size * 0.5, size, COLD, rise)


## Places of the `count` flames of a fire with the number `seed`, from north to south so that a flame covers the
## flames behind it. Each: [place in a disc of radius 1, when the fire comes to it (0 at the middle, about 1 at the
## rim, with a front that has lobes), a number from 0 to 1].
func _fire_spots(count: int, seed: int) -> Array:
	var key := Vector2i(count, seed)
	if not _spots.has(key):
		var spots := []
		for k in count:
			var far := sqrt((k + 0.5) / count)
			var jitter := (
				Vector2(_hash(Vector2(k, seed)) - 0.5, _hash(Vector2(seed, k + 0.5)) - 0.5) * 0.9 / sqrt(count)
			)
			var place := (Vector2.from_angle(k * 2.39996 + seed) * far * 0.94 + jitter).limit_length(1.0)
			var lobes := 1.0 + 0.22 * sin(place.angle() * 3.0 + seed) + 0.1 * sin(place.angle() * 5.0 - seed)
			spots.append([place, far * lobes, _hash(Vector2(k + 0.25, seed + 0.5))])
		spots.sort_custom(func(a: Array, b: Array) -> bool: return a[0].y < b[0].y)
		_spots[key] = spots
	return _spots[key]


## The laser sight beam of each unit with the perk.
func _draw_lasers() -> void:
	var lasers := get_node_or_null(^"Lasers") as Lasers
	if lasers == null:
		lasers = Lasers.new()
		lasers.name = &"Lasers"
		add_child(lasers)
	lasers.draw(world)


## Weapons and perks to pick up: the item art bobs over a shadow in a ring that pulses. The ring is white for a
## high-tier weapon and red for a perk.
func _draw_pickups() -> void:
	for p in world.pickups:
		var glow := Color("ff7676") if p.kind == &"perk" else Color("f4f8ff") if p.high_tier else Color("ffd668")
		var pulse: float = 0.5 + 0.5 * sin(world.now * 4.8 + p.order)
		var ground := Vector3(p.pos.x, 0.0, p.pos.y)
		var ring := _on_ground(0.6 + 0.12 * pulse)
		_ground.add(ground, ring * 0.8, Fx.Shape.DISC, glow, 0.0, 0.0, 1.0)
		_ground.add(ground, ring, Fx.Shape.DISC, glow, 0.0, 1.0 - 4.0 / ring.x)
		var bob: float = 9.0 + 2.5 * sin(world.now * 3.0 + p.order)
		_air.add(ground + Vector3.UP * Fx.up(bob), ART, Fx.Shape.ART, Color.WHITE, 0.0, Fx.cell(p.id), 1.0)
