class_name Ragdolls
extends Node3D
## Bodies of killed units. A body flies away from the killing hit and turns. It bounces off walls and slows down
## there. After the damage of the hit in metres of flight, the body is gone. The numbers come from the original.

const MAX_REACH := 28.0
## Part of the speed into a wall that comes back, and part of the speed along the wall that stays.
const BOUNCE := 0.72
const SLIDE := 0.9
## Most radians that a bounce turns a body off its way.
const JITTER := 0.16
## Brightness of a body, as a share of the brightness of a unit.
const TONE := 0.8

## Each body: pos, vel, turn and spin (radians and radians a second), life (metres of flight left), radius, color
## and left (1 when it looks to the left).
var bodies: Array[Dictionary] = []
var _views: Array[MeshInstance3D] = []


## Throws the body of a unit from `at` along `dir`. It flies `damage` metres.
func throw(at: Vector2, dir: Vector2, damage: float, radius: float, color: Color) -> void:
	var reach := clampf(damage, 0.0, MAX_REACH) * Tune.ragdoll_reach
	var spin := randf_range(-1.0, 1.0) * Tune.ragdoll_spin * clampf(reach / 20.0, 0.25, 1.4)
	var turn := randf_range(-0.36, 0.36)
	var vel := dir * reach / Tune.ragdoll_time
	# The body looks back to where it came from.
	var left := float(dir.x > 0.0)
	bodies.append(
		{pos = at, vel = vel, turn = turn, spin = spin, life = reach, radius = radius, color = color, left = left}
	)


## Moves each body on by `delta` seconds. A body bounces off a wall of `grid`. It flies over each thing that a unit
## vaults, and out of a wall that it starts in.
func step(delta: float, grid: ObstacleGrid) -> void:
	for i in range(bodies.size() - 1, -1, -1):
		var body := bodies[i]
		var speed: float = body.vel.length()
		if speed > 0.000001:
			var length := minf(speed * delta, body.life)
			var move: Vector2 = body.vel * length / speed
			var start: Vector2 = body.pos
			var samples := maxi(1, ceili(move.length() / maxf(0.08, body.radius * 0.35)))
			var free := not grid.circle_hits(start, body.radius, true)
			for n in range(1, samples + 1):
				var at := start + move * n / samples
				if free and grid.circle_hits(at, body.radius, true):
					# The wall stops the body along x, along y, or along both at a corner.
					var x_hits := grid.circle_hits(Vector2(at.x, body.pos.y), body.radius, true)
					var y_hits := grid.circle_hits(Vector2(body.pos.x, at.y), body.radius, true)
					var across := Vector2(float(x_hits or not y_hits), float(y_hits or not x_hits))
					var into: Vector2 = body.vel.project((move.sign() * across).normalized())
					body.vel = ((body.vel - into) * SLIDE - into * BOUNCE).rotated(randf_range(-JITTER, JITTER))
					break
				body.pos = at
			body.turn += body.spin * length / speed
			body.life -= length
		if body.life <= 0.0 or speed <= 0.000001:
			bodies.remove_at(i)
	_show()


## Shows each body as the art of a unit that stands still and turns. The body has no gun and no health bar.
func _show() -> void:
	while _views.size() < bodies.size():
		var view := MeshInstance3D.new()
		view.mesh = UnitView._canvas()
		var material := ShaderMaterial.new()
		material.shader = preload("res://shaders/unit.gdshader")
		material.render_priority = 1
		material.set_shader_parameter(&"sheet", SpriteArt.sheet())
		material.set_shader_parameter(&"frame", SpriteArt.frame_uv(false, 0))
		material.set_shader_parameter(&"hp", -1.0)
		material.set_shader_parameter(&"brightness", TONE)
		# The gun is far off the canvas.
		material.set_shader_parameter(&"hand", Vector2(0.0, 1000.0))
		view.material_override = material
		view.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		view.sorting_use_aabb_center = false
		add_child(view)
		_views.append(view)
	for i in _views.size():
		_views[i].visible = i < bodies.size()
		if i < bodies.size():
			var body := bodies[i]
			var material := _views[i].material_override as ShaderMaterial
			_views[i].position = Vector3(body.pos.x, 0.0, body.pos.y)
			material.set_shader_parameter(&"team", Vector3(body.color.r, body.color.g, body.color.b))
			material.set_shader_parameter(&"mirror", body.left)
			material.set_shader_parameter(&"tumble", Vector2(body.turn, 0.0))
