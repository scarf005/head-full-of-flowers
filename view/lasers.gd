class_name Lasers
extends MeshInstance3D
## Laser sight beams: a red line from the muzzle of each unit with the perk to the end of its beam.
## As in the original game, each beam pulses, and the beam of the player is brighter and wider than the beam of a bot.

var _mesh := ImmediateMesh.new()


func _init() -> void:
	mesh = _mesh
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.vertex_color_use_as_albedo = true
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	# Grass in front of the beam is higher on the screen than the beam, so the beam draws over the grass.
	# Units and props have the same priority and draw after the beam.
	material.no_depth_test = true
	material.render_priority = 1
	material_override = material
	sorting_offset = -100.0


## Draws the beams of this frame at the height of the shots.
func draw(world: SimWorld) -> void:
	_mesh.clear_surfaces()
	var pulse := 0.7 + (sin(world.now * 1.17) * 0.5 + 0.5) * 0.3
	var begun := false
	for u in world.units:
		if not u.has_perk(&"laser_sight"):
			continue
		var dir := u.aim.normalized() if u.aim.length_squared() > 0.0001 else Vector2.RIGHT
		var drift := u.vel * GameView.lag
		var start := u.pos + UnitView.muzzle(dir, u.weapon_id())
		var end := Combat.laser_end(world, u)
		var length := (end - start).dot(dir)
		if length <= 0.0:
			continue
		var color := Color("ff6a6a") if u.is_player else Color("ff5050")
		color.a = Tune.laser_alpha * pulse * (1.0 if u.is_player else 2.0 / 3.0)
		var side := dir.orthogonal() * Tune.laser_width * (1.0 if u.is_player else 0.75) * 0.5 / UnitView.PX_PER_M
		# The beam fades toward the end of its full length.
		var far := Color(color, color.a * (1.0 - 0.6 * length / Tune.laser_length))
		if not begun:
			_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
			begun = true
		var a := start - drift
		var b := a + dir * length
		for corner: Array in [
			[a, side, color], [b, side, far], [b, -side, far], [a, side, color], [b, -side, far], [a, -side, color]
		]:
			_mesh.surface_set_color(corner[2])
			var at: Vector2 = corner[0] + corner[1]
			_mesh.surface_add_vertex(Vector3(at.x, GameView.SHOT_HEIGHT, at.y))
	if begun:
		_mesh.surface_end()
