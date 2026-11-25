class_name Scorch
extends Node
## Marks that blasts and fires leave on the ground for the rest of a match: craters and burnt earth. The ground shader
## draws them and the grass shader hides the grass on them. The shaders read the global shader parameter `scorch`,
## which has 4 texels for each metre of the map. Its red channel holds the depth of a crater and its green channel
## holds the char, each from 0 to 1.

const PER_M := 4
## Char that a fire on the ground leaves.
const ZONE_CHAR := 0.8
## Metres of char around the middle of a cell that burnt.
const CELL_REACH := 0.9
## Radius of the char of a blast, as a share of the radius of its crater.
const CHAR_REACH := 1.5

var image: Image
var _texture: ImageTexture
var _half := 0.0
var _changed := false


func setup(map_size: int) -> void:
	_half = map_size / 2.0
	image = Image.create_empty(map_size * PER_M, map_size * PER_M, false, Image.FORMAT_RG8)
	_texture = ImageTexture.create_from_image(image)
	RenderingServer.global_shader_parameter_set(&"scorch", _texture)


func _process(_delta: float) -> void:
	if _changed:
		_texture.update(image)
		_changed = false


## Depth of a crater in x and char in y at a point.
func at(p: Vector2) -> Vector2:
	var texel := Vector2i(((p + Vector2(_half, _half)) * PER_M).floor())
	if not Rect2i(Vector2i.ZERO, image.get_size()).has_point(texel):
		return Vector2.ZERO
	var mark := image.get_pixelv(texel)
	return Vector2(mark.r, mark.g)


## Digs a crater of `radius` m, with char to CHAR_REACH times that radius.
func crater(middle: Vector2, radius: float) -> void:
	if radius > 0.0:
		_stamp(middle, radius * CHAR_REACH, radius, 1.0)


## Chars the ground in a disc of `radius` m. `amount` is from 0 to 1.
func burn(middle: Vector2, radius: float, amount: float) -> void:
	_stamp(middle, radius, 0.0, amount)


## Keeps the highest depth and char at each texel. The depth is a bowl of `pit` m. The char is `amount` and falls to 0
## over the outer third of a ragged disc of `reach` m.
func _stamp(middle: Vector2, reach: float, pit: float, amount: float) -> void:
	var size := image.get_size()
	var lo := (((middle - Vector2(reach, reach)) + Vector2(_half, _half)) * PER_M).floor()
	var hi := (((middle + Vector2(reach, reach)) + Vector2(_half, _half)) * PER_M).ceil()
	var turn := fposmod(middle.dot(Vector2(12.9898, 78.233)), TAU)
	for y in range(maxi(0, int(lo.y)), mini(size.y, int(hi.y) + 1)):
		for x in range(maxi(0, int(lo.x)), mini(size.x, int(hi.x) + 1)):
			var to := (Vector2(x, y) + Vector2(0.5, 0.5)) / PER_M - Vector2(_half, _half) - middle
			var gap := to.length()
			var edge := reach * (0.85 + 0.15 * sin(to.angle() * 5.0 + turn))
			var black := amount * clampf(3.0 * (edge - gap) / edge, 0.0, 1.0)
			var depth := 1.0 - gap * gap / (pit * pit) if gap < pit else 0.0
			if black <= 0.0 and depth <= 0.0:
				continue
			var old := image.get_pixel(x, y)
			image.set_pixel(x, y, Color(maxf(old.r, depth), maxf(old.g, black), 0.0))
	_changed = true
