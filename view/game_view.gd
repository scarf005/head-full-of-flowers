class_name GameView
extends Node3D
## Runs one match: steps the simulation, feeds player input and draws the state.

signal event(data: Dictionary)

## Shots fly at the height of the drawn gun.
const SHOT_HEIGHT := UnitView.HAND / UnitView.PX_PER_M / cos(CameraRig.PITCH)
## Smoke puffs of a rocket for each second of the match.
const SMOKE_RATE := 30.0
const FLAMES_PER_M2 := 0.6
## Size in pixels of a shape that shows item art at its drawn size, and at half of it.
const ART := Vector2(48.0, 48.0)
const SMALL_ART := Vector2(24.0, 24.0)
const INK := Color(0.2, 0.14, 0.2)
const FIRE: Array[Color] = [Color.WHITE, Color("ffe680"), Color("ff9a3c"), Color("e2552a"), Color("5a3a3a")]
const SMOKE: Array[Color] = [Color("7a7480"), Color("565160")]
## Camera shake of a blast by weapon: x is the amount, y is the most that the shake reaches.
const BLAST_SHAKE := {
	&"grenade": Vector2(0.55, 1.4), &"grenade-launcher": Vector2(0.24, 1.6), &"rocket-launcher": Vector2(0.42, 2.4)
}

## Game seconds from the drawn frame to the last tick. The sim ticks at 60 Hz and screens draw faster.
static var lag := 0.0
## Mouse pointer in root canvas units, from the last mouse event. A query of the pointer in each frame is a round
## trip to the display server.
static var mouse := Vector2.ZERO

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
var _kick := Vector2.ZERO
var _jitter := Vector2.ZERO
## Unit index -> the damage number that shows over it.
var _numbers := {}
var _bits := Bits.new()
var _units: Array[UnitView] = []
var _focus := Vector2.ZERO
## Flat pixel shapes on the ground, under the units: rings, fire glow and shadows.
var _ground := Fx.new(0)
## Flat pixel shapes over the units: shots, thrown things, flames, sparks, blasts and pickups.
var _air := Fx.new(2)
var _terrain: TerrainView
var _lights := 0
## Match time of the last drawn frame.
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
	add_child(_air)


func _physics_process(_delta: float) -> void:
	if world == null:
		return
	# The shake is a new random offset each tick. It fades in game time, so it also fades after the end.
	var real := Defs.TICK * Defs.GAME_SPEED
	shake = maxf(0.0, shake - real * 4.4)
	_jitter = Vector2(randf_range(-0.34, 0.34), randf_range(-0.28, 0.28)) * pow(minf(shake, 4.2), 1.08)
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
	var behind := 1.0 - Engine.get_physics_interpolation_fraction()
	lag = behind * Defs.TICK * Defs.GAME_SPEED * float(world.step > 0.0)
	var shot_lag := behind * world.step
	# The view follows the player only. A view that also follows the pointer moves the ground under a still pointer.
	_focus = _focus.lerp(player.pos - player.vel * lag, clampf(delta * 8.0, 0.0, 1.0))
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
	_draw_shots(shot_lag)
	_draw_throwables(shot_lag)
	_draw_zones()
	_draw_pickups()
	_ground.step(delta)
	_air.step(delta)
	_drawn = world.now


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
	player.want_fire = Input.is_action_pressed(&"fire")
	player.want_throw = Input.is_action_pressed(&"throw")


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
		&"hit":
			var color := world.team_color(e.team)
			_puff(e.pos, color, 40 if e.kill else 8, 7.0 if e.kill else 4.5, e.dir)
			_pop(e.pos, Color.WHITE, 1.6 if e.kill else 1.0, 0.07)
			if e.kill:
				_ring(e.pos, color, 2.4, 0.3)
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
			_ring(e.pos, Color(1.0, 0.8, 0.4), e.radius * 1.2, 0.25)
			_puff(e.pos, Color(0.22, 0.2, 0.2), 18, 8.0)
			# Full shake within 10 m of the player, none from 34 m.
			var near := clampf((34.0 - e.pos.distance_to(player.pos)) / 24.0, 0.0, 1.0)
			var blast: Vector2 = BLAST_SHAKE.get(e.weapon, BLAST_SHAKE[&"grenade"])
			shake = minf(maxf(shake, blast.y), shake + blast.x * near)
		&"box":
			_terrain.add_box(e.cell)
		&"respawn":
			_units[e.unit].grow = 0.2
			_ring(e.pos, world.team_color(world.units[e.unit].team), 1.3, 0.25)
		&"pickup":
			_ring(e.pos, Color(1.0, 0.9, 0.4), 1.1, 0.2)


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


## Damage number that rises and fades.
## Damage number over a unit. Hits on the same unit while its number shows add to that number.
func _number(target: int, at: Vector2, amount: float, color: Color) -> void:
	# A typed variable cannot take a freed object, so test the stored value first.
	var label: Label3D = _numbers[target] if is_instance_valid(_numbers.get(target)) else null
	if label == null:
		label = Label3D.new()
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.no_depth_test = true
		label.pixel_size = 0.06
		label.font_size = 16
		label.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		label.outline_size = 6
		label.modulate = color
		label.set_meta(&"total", 0.0)
		add_child(label)
		_numbers[target] = label
	var total: float = label.get_meta(&"total") + amount
	label.set_meta(&"total", total)
	label.text = str(int(total))
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


## Blast: smoke discs that rise, fire discs that shrink from white to dark red, and a white flash over both.
func _burst(at: Vector2, radius: float) -> void:
	var px := radius * UnitView.PX_PER_M
	var centre := Vector3(at.x, 0.6, at.y)
	for n in 14:
		var smoke := n < 6
		var out := Vector2.from_angle(randf() * TAU) * randf() * radius * 0.5
		var size := Vector2.ONE * px * randf_range(0.5, 0.9)
		var from := centre + Vector3(out.x, 0.0, out.y)
		if smoke:
			var more := {vel = Vector3(0.0, 1.6, 0.0), dots = 0.45}
			_air.spawn(from, randf_range(0.5, 0.8), Fx.Shape.DISC, size * 0.6, size, SMOKE, more)
		else:
			_air.spawn(from, randf_range(0.2, 0.4), Fx.Shape.DISC, size, size * 0.1, FIRE)
	var flash := Vector2.ONE * px * 1.7
	_air.spawn(centre, 0.07, Fx.Shape.DISC, flash, flash * 1.1, [Color.WHITE] as Array[Color])


## Shots: a teardrop along the flight, yellow for the side of the player and red for the others.
func _draw_shots(shot_lag: float) -> void:
	for i in world.projectiles.size():
		var p := world.projectiles[i]
		var ground := Vector3(p.pos.x - p.vel.x * shot_lag, 0.0, p.pos.y - p.vel.y * shot_lag)
		var at := ground + Vector3.UP * SHOT_HEIGHT
		var color := Color(1.0, 0.8, 0.2) if p.team == world.units[0].team else Color(1.0, 0.3, 0.25)
		match p.kind:
			&"flame":
				# Fire art over a dotted glow that grows along the flight. The art flips 8 times per second.
				var glow: float = 10.0 + 14.0 * p.travelled / p.reach
				var flip := float((i + int(world.now * 8.0)) % 2) * 2.0
				_air.add(at, Vector2(glow, glow), Fx.Shape.DISC, Color(1.0, 0.58, 0.28), 0.0, 0.0, 1.0)
				_air.add(at, ART, Fx.Shape.ART, Color.WHITE, 0.0, Fx.cell(&"fire"), flip)
			&"grenade":
				_air.add(at, SMALL_ART, Fx.Shape.ART, Color.WHITE, world.now * 14.0 + i, Fx.cell(&"grenade"), 1.0)
			_:
				var rocket: bool = p.kind == &"rocket"
				var width: float = roundf(maxf(4.0, p.radius * (36.0 if rocket else 28.0)))
				var length: float = width * 1.85 * clampf(p.vel.length() / 25.0, 1.1, 2.9)
				_air.add(at, Vector2.ONE * (length + 4.0), Fx.Shape.SHOT, color, Fx.turn_of(p.vel), width)
				# By match time: no more smoke on a fast screen, and none when the match stands still.
				if rocket and floorf(world.now * SMOKE_RATE) > floorf(_drawn * SMOKE_RATE):
					var puff := Vector2(8.0, 8.0)
					_air.spawn(at, 0.35, Fx.Shape.DISC, puff, puff * 1.8, SMOKE, {dots = 0.5})
		_ground.add(ground, Vector2(6.0, 4.0), Fx.Shape.DISC, INK, 0.0, 0.0, 1.0)


## Thrown grenades and fire bottles: the art turns in the air over a shadow. A red ring shows the reach of a blast.
func _draw_throwables(shot_lag: float) -> void:
	for i in world.throwables.size():
		var t := world.throwables[i]
		var ground := Vector3(t.pos.x - t.vel.x * shot_lag, 0.0, t.pos.y - t.vel.y * shot_lag)
		var height: float = 0.4 + sin(clampf(t.ttl, 0.0, 1.5) / 1.5 * PI) * 1.2
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
		var art := Fx.cell(&"molotov" if t.molotov else &"grenade")
		_air.add(ground + Vector3.UP * height, SMALL_ART, Fx.Shape.ART, tint, world.now * 9.0 + i, art, 1.0)


## Fire on the ground: a dotted glow with a bright rim, and flames that each stay at a place for 0.2 s.
func _draw_zones() -> void:
	for i in world.zones.size():
		var z := world.zones[i]
		var at := Vector3(z.pos.x, 0.0, z.pos.y)
		var size := _on_ground(z.radius)
		var ending: bool = z.life < 0.4
		if z.flame:
			_ground.add(at, size * 1.06, Fx.Shape.DISC, Color("3a2f28"), 0.0, 0.0, 1.0)
		_ground.add(at, size, Fx.Shape.DISC, Color("f4782e"), 0.0, 0.0, 1.0)
		_ground.add(at, size, Fx.Shape.DISC, Color("ffb054"), 0.0, 1.0 - 4.0 / size.x, float(ending))
		for k in ceili(z.radius * z.radius * PI * FLAMES_PER_M2 * clampf(z.life / 0.4, 0.0, 1.0)):
			var phase: float = world.now * 5.0 + k * 0.37
			var cell := Vector2(i * 31 + k, floorf(phase))
			var spot: Vector2 = (
				Vector2.from_angle(_hash(cell) * TAU) * sqrt(_hash(cell + Vector2(7.0, 3.0))) * z.radius * 0.85
			)
			var tint := Color.WHITE if fposmod(phase, 1.0) < 0.6 else Color(1.0, 0.75, 0.6)
			var flip := float(_hash(cell + Vector2(1.0, 9.0)) < 0.5) * 2.0
			# The flame stands on its place: its art is 6 pixels below the middle of the cell.
			var flame := at + Vector3(spot.x, Fx.up(6.0), spot.y)
			_air.add(flame, ART, Fx.Shape.ART, tint, 0.0, Fx.cell(&"fire"), flip)


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
