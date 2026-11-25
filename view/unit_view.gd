class_name UnitView
extends MeshInstance3D
## Pixel art of one unit: a fox-ear girl in the team colour, her gun, a health bar and, for the player, ammo rings.

## Art pixels per metre. The low-res view shows 20 pixels per metre, so one art pixel is one view pixel.
const PX_PER_M := 20.0
## Size of the mesh in pixels and the place of the feet in it, as in the shader.
const CANVAS := Vector2(64.0, 64.0)
const FEET := Vector2(32.0, 20.0)
## Pixels from the feet up to the hand, and from the body out to the centre of the gun.
const HAND := 7.0
const REACH := 9.0
## Pixels that the figure is above the ground in the middle of a vault.
const HOP := 7.0

static var _mesh: ArrayMesh
## [weapon id, unloaded] -> [texture, pixels from the centre of the art to the muzzle].
static var _guns := {}

var unit: SimUnit
## Scale of the figure. Set below 1 to make it pop up, for example at a respawn.
var grow := 1.0
## Ground of the match, to find water under the unit.
var map: TerrainMap
var _material := ShaderMaterial.new()
var _stride := 0.0
var _back := false
var _left := false
var _sink := 0.0


func setup(sim_unit: SimUnit, team_color: Color) -> void:
	unit = sim_unit
	mesh = _canvas()
	_material.shader = preload("res://shaders/unit.gdshader")
	# After the ink outline pass: the art has its own outline.
	_material.render_priority = 1
	_material.set_shader_parameter(&"sheet", SpriteArt.sheet())
	_material.set_shader_parameter(&"team", Vector3(team_color.r, team_color.g, team_color.b))
	# The bar of the player is white in each mode: team mates have the same colour as the player.
	var bar := Color(1.0, 1.0, 0.92) if unit.is_player else team_color
	_material.set_shader_parameter(&"bar_color", Vector3(bar.r, bar.g, bar.b))
	material_override = _material
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# Units and props are upright art on the ground: the one nearer to the camera draws last.
	sorting_use_aabb_center = false


func _process(delta: float) -> void:
	var at := unit.pos - unit.vel * GameView.lag
	var ppm := (get_viewport().get_camera_3d() as CameraRig).pixels_per_meter()
	# On the pixel grid of the view, so each art pixel is one whole view pixel.
	position = Vector3(snappedf(at.x, 1.0 / ppm.x), 0.0, snappedf(at.y, 1.0 / ppm.y))
	grow = move_toward(grow, 1.0, delta * 5.0)
	scale = Vector3.ONE * grow
	if absf(unit.aim.y) > 0.15:
		_back = unit.aim.y < 0.0
	if absf(unit.aim.x) > 0.1:
		_left = unit.aim.x < 0.0
	var speed := unit.vel.length()
	_stride += maxf(speed, 1.2) * delta
	var frame := 2 + int(_stride * 1.6) % 4 if speed > 0.8 else int(_stride * 1.2) % 2
	# A unit in drawn water stands knee-deep.
	var deep := 4.0 if map and TerrainView.tile(map, at) == TerrainMap.Tile.WATER else 0.0
	_sink = move_toward(_sink, deep, delta * 30.0)
	var reloading := unit.reload_cooldown > 0.0
	var gun := gun_art(unit.weapon_id(), reloading)
	var texture: Texture2D = gun[0]
	var dir := view_dir(unit.aim)
	# A gun in a reload points 35 degrees down.
	var turn := dir.angle() + (0.6 if _left else -0.6) * float(reloading)
	_material.set_shader_parameter(&"frame", SpriteArt.frame_uv(_back, frame))
	_material.set_shader_parameter(&"mirror", float(_left))
	_material.set_shader_parameter(&"gun", texture)
	_material.set_shader_parameter(&"gun_px", texture.get_size())
	_material.set_shader_parameter(&"hand", Vector2(0.0, HAND) + dir * (REACH - unit.recoil * 4.0))
	_material.set_shader_parameter(&"angle", turn)
	_material.set_shader_parameter(&"gun_front", float(not _back))
	_material.set_shader_parameter(&"sink", roundf(_sink))
	_material.set_shader_parameter(&"hp", unit.hp / unit.max_hp)
	_material.set_shader_parameter(&"flash", unit.hit_flash)
	var part := (
		unit.vault_from.distance_to(unit.pos) / unit.vault_from.distance_to(unit.vault_to) if unit.vaulting else 0.0
	)
	_material.set_shader_parameter(&"tumble", Vector2(0.0, roundf(sin(PI * clampf(part, 0.0, 1.0)) * HOP)))
	if unit.is_player:
		_material.set_shader_parameter(&"rings", _rings(reloading))


## The aim as a direction in view pixels, x to the right and y up. The camera looks down, so north and south are
## shorter.
static func view_dir(aim: Vector2) -> Vector2:
	return Vector2(aim.x, -aim.y * sin(CameraRig.PITCH))


## Where the muzzle of the drawn gun is, as a sim offset from the unit at the height of HAND.
static func muzzle(aim: Vector2, weapon: StringName) -> Vector2:
	var tip: float = gun_art(weapon, false)[1]
	return aim * (REACH + tip / view_dir(aim).length()) / PX_PER_M


## [texture, pixels from the centre of the art to the muzzle] of a weapon. Only some weapons have unloaded art.
static func gun_art(weapon: StringName, unloaded: bool) -> Array:
	var key := [weapon, unloaded]
	if not _guns.has(key):
		var path := "res://assets/sprites/%s-unloaded.png" % weapon
		if not unloaded or not ResourceLoader.exists(path):
			path = "res://assets/sprites/%s.png" % weapon
		var texture: Texture2D = load(path)
		_guns[key] = [texture, texture.get_image().get_used_rect().end.x - texture.get_width() * 0.5]
	return _guns[key]


## Fill of the magazine ring and of the grenade ring, then 1 during a reload.
func _rings(reloading: bool) -> Vector3:
	var slot := unit.slot()
	var mag: float = Defs.WEAPONS[slot.id].mag
	var primary := 1.0 if is_inf(slot.ammo) else clampf(slot.ammo / mag, 0.0, 1.0)
	if reloading:
		primary = 1.0 - unit.reload_cooldown / unit.reload_cooldown_max
	var secondary := 1.0
	if unit.secondary_cooldown > 0.0 and unit.secondary_cooldown_max > 0.0:
		secondary = 1.0 - unit.secondary_cooldown / unit.secondary_cooldown_max
	return Vector3(primary, secondary, float(reloading))


## The pixels above the feet stand upright and the pixels below lie on the ground toward the camera. Both parts
## show one art pixel in each view pixel.
static func _canvas() -> ArrayMesh:
	if _mesh == null:
		var half := CANVAS.x * 0.5 / PX_PER_M
		var front := FEET.y / PX_PER_M / sin(CameraRig.PITCH)
		var top := (CANVAS.y - FEET.y) / PX_PER_M / cos(CameraRig.PITCH)
		var tool := SurfaceTool.new()
		tool.begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
		var split := 1.0 - FEET.y / CANVAS.y
		# Each row: [height, distance toward the camera, v of the art].
		for row: Array in [[0.0, front, 1.0], [0.0, 0.0, split], [top, 0.0, 0.0]]:
			for side: float in [-1.0, 1.0]:
				tool.set_uv(Vector2(side * 0.5 + 0.5, row[2]))
				tool.add_vertex(Vector3(side * half, row[0], row[1]))
		_mesh = tool.commit()
	return _mesh
