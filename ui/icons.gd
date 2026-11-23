class_name Icons
## White 32 px silhouettes from game-icons.net, one per weapon, perk, secondary and menu action. Tint with modulate.

## Keep each texture alive: a _draw() call stores only the texture RID.
static var _cache := {}


static func get_icon(id: StringName) -> Texture2D:
	if not _cache.has(id):
		_cache[id] = load("res://assets/icons/%s.svg" % id)
	return _cache[id]
