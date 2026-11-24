class_name Icons
## Icons of the HUD, the menu and the debug panel. A weapon, a secondary and a perk show the item art of
## `assets/sprites`, as the HUD of the original game does. The art gets a light rim. The other ids show a white
## 32 px silhouette from game-icons.net. Tint a silhouette with modulate.

const SECONDARIES: Array[StringName] = [&"grenade", &"molotov"]
## The light rim keeps dark item art visible on the dark plates of the HUD.
const RIM := Color("ebebf2")

## Keep each texture alive: a _draw() call stores only the texture RID.
static var _cache := {}


static func get_icon(id: StringName) -> Texture2D:
	if not _cache.has(id):
		_cache[id] = _art(id) if is_art(id) else load("res://assets/icons/%s.svg" % id)
	return _cache[id]


## True when the icon of `id` is item art. Draw item art at a whole scale and do not tint it.
static func is_art(id: StringName) -> bool:
	return id in Defs.WEAPON_IDS or id in SECONDARIES or Defs.PERKS.has(id)


## The rect of `texture` in the middle of `box` at the largest whole scale that fits, and at most `most`.
## A texture that is larger than the box shrinks to fit.
static func fit(texture: Texture2D, box: Rect2, most := 99) -> Rect2:
	var room := box.size / texture.get_size()
	var scale := minf(room.x, room.y)
	scale = clampf(floorf(scale), 1.0, float(most)) if scale >= 1.0 else scale
	var size := texture.get_size() * scale
	return Rect2((box.get_center() - size * 0.5).round(), size)


## The art of the item without the empty border of its sprite, with a 1 px rim around each pixel of the art.
static func _art(id: StringName) -> Texture2D:
	var sprite := (load("res://assets/sprites/%s.png" % id) as Texture2D).get_image()
	sprite.convert(Image.FORMAT_RGBA8)
	var used := sprite.get_used_rect()
	var art := Image.create_empty(used.size.x + 2, used.size.y + 2, false, Image.FORMAT_RGBA8)
	art.blit_rect(sprite, used, Vector2i.ONE)
	var rim := art.duplicate() as Image
	for y in art.get_height():
		for x in art.get_width():
			if art.get_pixel(x, y).a >= 0.5:
				continue
			for dy in [-1, 0, 1]:
				for dx in [-1, 0, 1]:
					var near := Vector2i(x + dx, y + dy)
					if Rect2i(Vector2i.ZERO, art.get_size()).has_point(near) and art.get_pixelv(near).a >= 0.5:
						rim.set_pixel(x, y, RIM)
	return ImageTexture.create_from_image(rim)
