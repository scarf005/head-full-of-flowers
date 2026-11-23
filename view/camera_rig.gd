class_name CameraRig
extends Camera3D
## Orthographic follow camera. Moves in whole low-res pixels so the dither pattern can stay fixed on the ground.

const VISIBLE_WIDTH_M := 25.0
const PITCH := deg_to_rad(55.0)
const DISTANCE := 60.0

## Sim position (x, y) the camera looks at, before pixel snapping.
var target := Vector2.ZERO
## Pattern offset in low-res pixels for the dither pass.
var pattern_offset := Vector2.ZERO


func _ready() -> void:
	projection = PROJECTION_ORTHOGONAL
	keep_aspect = KEEP_WIDTH
	near = 1.0
	far = 200.0
	rotation = Vector3(-PITCH, 0.0, 0.0)
	var quad := MeshInstance3D.new()
	var mesh := QuadMesh.new()
	mesh.size = Vector2(2.0, 2.0)
	quad.mesh = mesh
	quad.extra_cull_margin = 16384.0
	quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := ShaderMaterial.new()
	material.shader = preload("res://shaders/outline.gdshader")
	quad.material_override = material
	add_child(quad)
	size = rest_size()
	apply()


## Metres of ground across the view when no zoom runs: 25 at 16:9 and narrower. A wider window sees more to the
## sides, not less above and below.
func rest_size() -> float:
	var view := get_viewport().get_visible_rect().size
	return VISIBLE_WIDTH_M * maxf(1.0, view.x / view.y * 9.0 / 16.0)


func pixels_per_meter() -> Vector2:
	var width := float(get_viewport().get_visible_rect().size.x)
	var ppm := width / size
	return Vector2(ppm, ppm * sin(PITCH))


func apply() -> void:
	var ppm := pixels_per_meter()
	var snapped_px := Vector2(roundf(target.x * ppm.x), roundf(target.y * ppm.y))
	# During a zoom the pixels per metre change, and a moving offset makes the whole pattern flicker.
	if is_equal_approx(size, rest_size()):
		pattern_offset = snapped_px
	var ground := Vector3(snapped_px.x / ppm.x, 0.0, snapped_px.y / ppm.y)
	position = ground + Vector3(0.0, sin(PITCH), cos(PITCH)) * DISTANCE


## Sim position under a point of the 3D viewport, on the plane at `height` metres.
func ground_point(viewport_pos: Vector2, height := 0.0) -> Vector2:
	var origin := project_ray_origin(viewport_pos)
	var dir := project_ray_normal(viewport_pos)
	var t := (height - origin.y) / dir.y
	var hit := origin + dir * t
	return Vector2(hit.x, hit.z)
