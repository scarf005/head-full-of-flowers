class_name GameView
extends Node3D
## Runs one match: steps the simulation, feeds player input and draws the state.

signal event(data: Dictionary)

const SHOT_HEIGHT := 0.75
const SHOT_COLORS := {
	&"ballistic": Color(1.0, 0.9, 0.5),
	&"flame": Color(1.0, 0.45, 0.1),
	&"grenade": Color(0.5, 0.9, 0.4),
	&"rocket": Color(1.0, 0.6, 0.3),
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
## Seconds left of the opening, in which the camera closes in and the match waits.
var intro := 0.0
## Screen tint for the post pass. Alpha is the strength and fades out.
var tint := Color(0, 0, 0, 0)
## True from the last right stick aim until the mouse moves.
var _stick_aim := false
var _kick := Vector2.ZERO
var _bits := Bits.new()
var _units: Array[UnitView] = []
var _ring_mesh := TorusMesh.new()
var _focus := Vector2.ZERO
var _shots: MultiMesh
var _blobs: MultiMesh
var _fires: MultiMesh
var _pickups: Array[Sprite3D] = []
var _arena: MeshInstance3D
var _lights := 0


func setup(config: Dictionary) -> void:
	world = SimWorld.new(config)
	player = world.units[0]
	_focus = player.pos
	add_child(camera)
	add_child(Quality.sun())
	var env := WorldEnvironment.new()
	env.environment = Quality.environment()
	add_child(env)
	var terrain := TerrainView.new()
	terrain.setup(world)
	add_child(terrain)
	var grass := GrassView.new()
	grass.setup(world)
	add_child(grass)
	var flowers := FlowerView.new()
	flowers.setup(world)
	add_child(flowers)
	for u in world.units:
		var view := UnitView.new()
		view.setup(u, world.team_color(u.team))
		add_child(view)
		_units.append(view)
	add_child(_bits)
	_ring_mesh.inner_radius = 0.86
	_ring_mesh.outer_radius = 1.0
	_ring_mesh.ring_segments = 3
	_ring_mesh.rings = 32
	var ball := SphereMesh.new()
	ball.radial_segments = 8
	ball.rings = 4
	var shot_material := ShaderMaterial.new()
	shot_material.shader = preload("res://shaders/shot.gdshader")
	_shots = _multimesh(ball, Defs.PROJECTILE_CAPACITY, true)
	(get_child(-1) as MultiMeshInstance3D).material_override = shot_material
	# Thrown grenades are solid objects, not glowing shots.
	_blobs = _multimesh(ball, 96, false)
	var disc := CylinderMesh.new()
	disc.height = 0.06
	disc.radial_segments = 10
	_fires = _multimesh(disc, 36, true)
	_arena = MeshInstance3D.new()
	var wall := CylinderMesh.new()
	wall.height = 1.6
	wall.cap_top = false
	wall.cap_bottom = false
	wall.radial_segments = 96
	_arena.mesh = wall
	_arena.position.y = 0.8
	var wall_material := ShaderMaterial.new()
	wall_material.shader = preload("res://shaders/arena_wall.gdshader")
	_arena.material_override = wall_material
	add_child(_arena)


func _physics_process(delta: float) -> void:
	if world == null or world.finished:
		return
	if intro > 0.0:
		intro -= delta
		if intro <= 0.0:
			event.emit({type = &"go"})
		return
	if autoplay:
		Bots.think(world, player, Defs.TICK * Defs.GAME_SPEED)
	else:
		_read_input()
	world.tick()
	for e in world.events:
		_show(e)
		event.emit(e)
	world.events.clear()


func _unhandled_input(input: InputEvent) -> void:
	if input is InputEventMouseMotion:
		_stick_aim = false
	if player and input.is_action_pressed(&"swap_next"):
		player.want_swap = 1
	elif player and input.is_action_pressed(&"swap_prev"):
		player.want_swap = -1
	elif player and input.is_action_pressed(&"reload"):
		player.want_reload = true


func _process(delta: float) -> void:
	if world == null:
		return
	RenderingServer.global_shader_parameter_set(&"match_time", world.now)
	RenderingServer.global_shader_parameter_set(&"arena_radius", world.arena_radius)
	var behind := 1.0 - Engine.get_physics_interpolation_fraction()
	lag = behind * Defs.TICK * Defs.GAME_SPEED * float(world.step > 0.0)
	var shot_lag := behind * world.step
	shake = maxf(0.0, shake - delta * 4.4)
	_focus = _focus.lerp(player.pos - player.vel * lag + player.aim * 2.0, clampf(delta * 8.0, 0.0, 1.0))
	_kick = _kick.lerp(Vector2.ZERO, clampf(delta * 12.0, 0.0, 1.0))
	tint.a = maxf(0.0, tint.a - delta * 2.5)
	var rest := camera.rest_size()
	camera.size = lerpf(camera.size, rest, clampf(delta * 6.0, 0.0, 1.0))
	if absf(camera.size - rest) < 0.02:
		camera.size = rest
	if intro > 0.0:
		camera.size = rest + intro * intro * 14.0
	camera.target = _focus + _kick + Vector2.from_angle(randf() * TAU) * shake * shake * 0.5
	camera.apply()
	_arena.scale = Vector3(world.arena_radius * 2.0, 1.0, world.arena_radius * 2.0)
	_shots.visible_instance_count = world.projectiles.size()
	for i in world.projectiles.size():
		var p := world.projectiles[i]
		var progress: float = p.travelled / p.reach
		var wide: float = p.radius * 1.7
		var size := Vector3(wide, wide, wide * 2.6)
		var color := Color(1.0, 0.8, 0.1) if p.team == world.units[0].team else Color(1.0, 0.22, 0.12)
		match p.kind:
			&"flame":
				size = Vector3.ONE * (0.35 + progress * 1.1)
				color = Color(1.0, 0.9, 0.3).lerp(Color(0.9, 0.2, 0.05), progress)
			&"grenade":
				size = Vector3.ONE * 0.6
			&"rocket":
				size = Vector3(0.5, 0.5, 1.3)
		var pulse := 1.0 + 0.12 * sin(world.now * 40.0 + i)
		# Scale first, then turn: Basis.scaled() would stretch along the world axes.
		var basis := Basis(Vector3.UP, atan2(-p.vel.x, -p.vel.y)) * Basis.from_scale(size * pulse)
		_shots.set_instance_transform(
			i, Transform3D(basis, Vector3(p.pos.x - p.vel.x * shot_lag, SHOT_HEIGHT, p.pos.y - p.vel.y * shot_lag))
		)
		_shots.set_instance_color(i, color)
	_blobs.visible_instance_count = world.throwables.size()
	for i in world.throwables.size():
		var t := world.throwables[i]
		var height: float = 0.4 + sin(clampf(t.ttl, 0.0, 1.5) / 1.5 * PI) * 1.2
		_blobs.set_instance_transform(
			i,
			Transform3D(
				Basis.from_scale(Vector3.ONE * 0.45),
				Vector3(t.pos.x - t.vel.x * shot_lag, height, t.pos.y - t.vel.y * shot_lag)
			)
		)
		var blink := fmod(world.now, 0.24) < 0.08
		var shell := Color(0.85, 0.4, 0.15) if t.molotov else Color(0.16, 0.3, 0.16)
		_blobs.set_instance_color(i, Color(1.0, 0.25, 0.2) if blink else shell)
	_fires.visible_instance_count = world.zones.size()
	for i in world.zones.size():
		var z := world.zones[i]
		var flicker := 0.9 + 0.1 * sin(world.now * 30.0 + i)
		var basis := Basis.from_scale(Vector3(z.radius * 2.0 * flicker, 1.0, z.radius * 2.0 * flicker))
		_fires.set_instance_transform(i, Transform3D(basis, Vector3(z.pos.x, 0.05, z.pos.y)))
		_fires.set_instance_color(i, Color(1.0, 0.4, 0.05) * (2.0 + flicker))
	_draw_pickups()


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
	match e.type:
		&"shot":
			var at: Vector2 = e.pos + e.dir * 0.7
			_flash(Vector3(at.x, 0.8, at.y), Color(1.0, 0.8, 0.4), 2.5, 0.06)
			_pop(at, Color(1.0, 0.95, 0.6), 0.9, 0.05)
			if e.weapon != &"flamethrower":
				var side: Vector2 = e.dir.orthogonal() * randf_range(1.5, 3.0)
				_bits.add(
					Vector3(e.pos.x, 0.7, e.pos.y), Vector3(side.x, 3.5, side.y), Color(0.95, 0.75, 0.25), 0.07, 0.9
				)
			if e.unit == 0:
				var weapon: Dictionary = Defs.WEAPONS[e.weapon]
				var punch: float = 0.5 + 0.12 * weapon.pellets + 0.06 * weapon.damage
				shake = minf(1.0, shake + 0.12 * punch)
				_kick -= e.dir * 0.22 * punch
		&"hit":
			var color := world.team_color(e.team)
			_puff(e.pos, color, 40 if e.kill else 8, 7.0 if e.kill else 4.5, e.dir)
			_pop(e.pos, Color.WHITE, 1.6 if e.kill else 1.0, 0.07)
			if e.kill:
				_ring(e.pos, color, 2.4, 0.3)
			if e.target == 0 or e.source == 0:
				shake = minf(1.2, shake + (0.66 if e.target == 0 else 0.4) + (0.5 if e.kill else 0.0))
				_number(e.pos, e.damage, Color(1.0, 0.4, 0.4) if e.target == 0 else Color.WHITE)
			if e.target == 0:
				tint = Color(0.85, 0.05, 0.12, 0.55)
				_kick += e.dir * 0.4
			elif e.source == 0 and e.kill:
				tint = Color(1.0, 1.0, 1.0, 0.35)
				camera.size = camera.rest_size() - 1.6
		&"cell":
			var at := world.grid.center_of(e.cell)
			_puff(at, TerrainView.CELL_LOOK[mini(e.material, 7)][0], 14 if e.destroyed else 3, 4.0)
			_pop(at, Color.WHITE, 0.7, 0.05)
		&"explosion":
			_flash(Vector3(e.pos.x, 1.0, e.pos.y), Color(1.0, 0.6, 0.25), e.radius * 2.5, 0.35)
			_burst(e.pos, e.radius)
			_ring(e.pos, Color(1.0, 0.8, 0.4), e.radius * 1.2, 0.25)
			_puff(e.pos, Color(0.22, 0.2, 0.2), 18, 8.0)
			shake = minf(1.5, shake + 6.0 / maxf(4.0, e.pos.distance_to(player.pos)))
		&"respawn":
			_units[e.unit].grow = 0.2
			_ring(e.pos, world.team_color(world.units[e.unit].team), 1.3, 0.25)
		&"pickup":
			_ring(e.pos, Color(1.0, 0.9, 0.4), 1.1, 0.2)


## Flat ring on the ground that widens to `radius` and goes away.
func _ring(at: Vector2, color: Color, radius: float, seconds: float) -> void:
	var ring := MeshInstance3D.new()
	ring.mesh = _ring_mesh
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	ring.material_override = material
	ring.position = Vector3(at.x, 0.2, at.y)
	ring.scale = Vector3(0.3, 0.2, 0.3)
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(ring)
	var tween := create_tween()
	tween.tween_property(ring, "scale", Vector3(radius, 0.2, radius), seconds).set_ease(Tween.EASE_OUT)
	tween.tween_callback(ring.queue_free)


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


## White-hot ball that shows for a few frames: muzzle flash or impact spark.
func _pop(at: Vector2, color: Color, size: float, seconds: float) -> void:
	var ball := _ball(Vector3(at.x, 0.8, at.y), color * 1.8, false)
	ball.scale = Vector3.ONE * size
	get_tree().create_timer(seconds, false).timeout.connect(ball.queue_free)


## Spray of small cubes that fall and bounce. `dir` pushes the spray one way.
func _puff(at: Vector2, color: Color, amount: int, speed: float, dir := Vector2.ZERO) -> void:
	for n in amount:
		var out := (dir + Vector2.from_angle(randf() * TAU) * 0.7) * speed * randf_range(0.3, 1.0)
		var up := randf_range(1.5, 5.5)
		_bits.add(
			Vector3(at.x, 0.7, at.y), Vector3(out.x, up, out.y), color, randf_range(0.07, 0.17), randf_range(0.5, 1.1)
		)


## Damage number that rises and fades.
func _number(at: Vector2, amount: float, color: Color) -> void:
	var label := Label3D.new()
	label.text = str(int(amount))
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.pixel_size = 0.06
	label.font_size = 16
	label.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	label.outline_size = 6
	label.modulate = color
	label.position = Vector3(at.x + randf_range(-0.3, 0.3), 1.6, at.y)
	add_child(label)
	var tween := create_tween()
	tween.tween_property(label, "position:y", 2.8, 0.5)
	tween.tween_callback(label.queue_free)


func _burst(at: Vector2, radius: float) -> void:
	for n in 12:
		var fire := n < 6
		var out := Vector2.from_angle(randf() * TAU) * randf() * radius * 0.45
		var color := (
			Color(1.0, randf_range(0.55, 0.9), 0.25) * 1.6
			if fire
			else Color.from_hsv(0.08, 0.12, randf_range(0.3, 0.5))
		)
		var ball := _ball(Vector3(at.x + out.x, 0.6, at.y + out.y), color, not fire)
		ball.scale = Vector3.ONE * 0.2
		var life := randf_range(0.12, 0.22) if fire else randf_range(0.5, 0.9)
		var tween := create_tween()
		tween.tween_property(ball, "scale", Vector3.ONE * radius * randf_range(0.3, 0.5), life * 0.35)
		tween.tween_property(ball, "scale", Vector3.ZERO, life * 0.65)
		tween.parallel().tween_property(ball, "position:y", 0.6 if fire else randf_range(1.4, 2.4), life * 0.65)
		tween.tween_callback(ball.queue_free)


## A low-poly ball of one colour that the caller animates and frees.
func _ball(at: Vector3, color: Color, lit: bool) -> MeshInstance3D:
	var ball := MeshInstance3D.new()
	ball.mesh = _shots.mesh
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL if lit else BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	ball.material_override = material
	ball.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ball.position = at
	add_child(ball)
	return ball


func _draw_pickups() -> void:
	while _pickups.size() < world.pickups.size():
		var node := Sprite3D.new()
		node.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		node.pixel_size = 0.035
		node.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		node.no_depth_test = true
		node.render_priority = 1
		var rim := node.duplicate() as Sprite3D
		rim.render_priority = 0
		rim.scale = Vector3.ONE * 1.3
		rim.modulate = Color(0.05, 0.05, 0.08)
		node.add_child(rim)
		add_child(node)
		_pickups.append(node)
	for i in _pickups.size():
		var node := _pickups[i]
		node.visible = i < world.pickups.size()
		if not node.visible:
			continue
		var p := world.pickups[i]
		var perk: bool = p.kind == &"perk"
		node.position = Vector3(p.pos.x, 0.9 + sin(world.now * 3.0 + p.order) * 0.12, p.pos.y)
		node.texture = Icons.get_icon(p.id)
		(node.get_child(0) as Sprite3D).texture = node.texture
		node.modulate = Color(0.6, 1.0, 0.9) if perk else Color(1.0, 0.8, 0.3) if p.high_tier else Color.WHITE


func _multimesh(mesh: Mesh, count: int, glow: bool) -> MultiMesh:
	var node := MultiMeshInstance3D.new()
	node.multimesh = MultiMesh.new()
	node.multimesh.transform_format = MultiMesh.TRANSFORM_3D
	node.multimesh.use_colors = true
	node.multimesh.mesh = mesh
	node.multimesh.instance_count = count
	node.multimesh.visible_instance_count = 0
	node.custom_aabb = AABB(Vector3(-60, 0, -60), Vector3(120, 4, 120))
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	if glow:
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	node.material_override = material
	add_child(node)
	return node.multimesh
