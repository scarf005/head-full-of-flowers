class_name Hud
extends Control
## In-match overlay: score bar, timer, health, ammo, kill feed, minimap and crosshair.

const MAP_PX := 150.0

var game: GameView
var feed: Array[Dictionary] = []
var _map := ImageTexture.new()
var _map_revision := -1


func setup(view: GameView) -> void:
	game = view
	feed.clear()
	_map_revision = -1
	if not game.event.is_connected(_on_event):
		game.event.connect(_on_event)


static func unit_name(u: SimUnit) -> String:
	return TranslationServer.translate("You") if u.is_player else "Bot %d" % u.index


func _process(delta: float) -> void:
	for row in feed:
		row.ttl -= delta
	feed = feed.filter(func(row: Dictionary) -> bool: return row.ttl > 0.0)
	queue_redraw()


func _on_event(e: Dictionary) -> void:
	if e.type != &"hit" or not e.kill:
		return
	var w := game.world
	var victim := unit_name(w.units[e.target])
	var killer := unit_name(w.units[e.source]) if e.source >= 0 and e.source != e.target else ""
	var text := "%s > %s" % [killer, victim] if killer else "x %s" % victim
	feed.append({text = text, color = w.team_color(e.team), ttl = 4.0})
	if feed.size() > 5:
		feed.pop_front()


func _draw() -> void:
	if game == null or game.world == null:
		return
	var w := game.world
	var p := game.player
	var font := get_theme_default_font()
	var ink := Color(0.05, 0.05, 0.08)
	# Score bar: one segment per team, sized by its petals.
	var total := 0
	for row in w.standings():
		total += row.petals
	var bar := Rect2(size.x * 0.25, 12.0, size.x * 0.5, 14.0)
	draw_rect(bar.grow(2.0), ink)
	var x := bar.position.x
	for team in w.team_count:
		var width := bar.size.x * w.flowers.score(team) / maxf(1.0, total)
		draw_rect(Rect2(x, bar.position.y, width, bar.size.y), w.team_color(team))
		x += width
	var clock := "%d:%02d" % [int(w.time_left) / 60, int(w.time_left) % 60]
	_text(font, Vector2(size.x * 0.5 - 24.0, 52.0), clock, Color.WHITE, 24)
	_text(font, Vector2(bar.position.x, 46.0), "%d" % w.flowers.score(p.team), w.team_color(p.team), 16)
	# Health pips.
	for pip in int(p.max_hp):
		var at := Rect2(16.0 + pip * 14.0, size.y - 34.0, 12.0, 18.0)
		draw_rect(at.grow(2.0), ink)
		if pip < ceili(p.hp):
			draw_rect(at, Color(0.95, 0.3, 0.35))
	# Weapon, ammo, reload and secondary.
	var slot := p.slot()
	var reserve := "--" if is_inf(slot.reserve) else str(int(slot.reserve))
	var right := size.x - 16.0
	_text(font, Vector2(right - 220.0, size.y - 44.0), tr(Defs.WEAPONS[slot.id].name), Color.WHITE, 16)
	_text(font, Vector2(right - 220.0, size.y - 18.0), "%d / %s" % [slot.ammo, reserve], Color.WHITE, 24)
	if p.reload_cooldown > 0.0:
		var part := 1.0 - p.reload_cooldown / p.reload_cooldown_max
		draw_rect(Rect2(right - 220.0, size.y - 12.0, 204.0 * part, 4.0), Color.WHITE)
	var ready := 1.0 - p.secondary_cooldown / maxf(0.01, p.secondary_cooldown_max)
	var label := tr("Molotov") if p.secondary == &"molotov" else tr("Grenade")
	_text(font, Vector2(right - 90.0, size.y - 44.0), label, Color.WHITE if ready >= 1.0 else Color(0.6, 0.6, 0.6), 16)
	draw_rect(Rect2(right - 90.0, size.y - 38.0, 74.0 * clampf(ready, 0.0, 1.0), 4.0), Color(1.0, 0.7, 0.3))
	var perk_x := 16.0
	for id: StringName in p.perks:
		_text(font, Vector2(perk_x, size.y - 46.0), tr(Defs.PERKS[id].name), Color(0.6, 1.0, 0.9), 16)
		perk_x += font.get_string_size(tr(Defs.PERKS[id].name), HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x + 12.0
	for i in feed.size():
		_text(font, Vector2(right - 200.0, 30.0 + i * 20.0), feed[i].text, feed[i].color, 16)
	_draw_map(w)
	# Crosshair.
	var mouse := get_local_mouse_position()
	for arm: Vector2 in [Vector2.RIGHT, Vector2.LEFT, Vector2.UP, Vector2.DOWN]:
		draw_line(mouse + arm * 5.0, mouse + arm * 12.0, ink, 4.0)
		draw_line(mouse + arm * 5.0, mouse + arm * 12.0, Color.WHITE, 2.0)


func _draw_map(w: SimWorld) -> void:
	if w.grid.revision != _map_revision:
		_map_revision = w.grid.revision
		var image := Image.create(w.grid.size, w.grid.size, false, Image.FORMAT_RGBA8)
		for i in w.grid.solid.size():
			if w.grid.solid[i]:
				image.set_pixel(i % w.grid.size, i / w.grid.size, Color(1, 1, 1, 0.55))
		_map.set_image(image)
	var origin := Vector2(16.0, 16.0)
	var scale := MAP_PX / (w.arena_start * 2.0)
	var centre := origin + Vector2.ONE * MAP_PX * 0.5
	draw_rect(Rect2(origin, Vector2.ONE * MAP_PX), Color(0.05, 0.05, 0.08, 0.7))
	var half := w.grid.size * 0.5 * scale
	draw_texture_rect(_map, Rect2(centre - Vector2.ONE * half, Vector2.ONE * half * 2.0), false)
	draw_arc(centre, w.arena_radius * scale, 0.0, TAU, 48, Color(1.0, 0.4, 0.35), 2.0)
	for pickup in w.pickups:
		draw_rect(Rect2(centre + pickup.pos * scale - Vector2.ONE * 1.5, Vector2.ONE * 3.0), Color(1.0, 0.85, 0.3))
	for u in w.units:
		draw_circle(centre + u.pos * scale, 4.0 if u.is_player else 3.0, w.team_color(u.team))
	draw_arc(centre + w.units[0].pos * scale, 6.0, 0.0, TAU, 12, Color.WHITE, 1.0)


func _text(font: Font, at: Vector2, text: String, color: Color, px: int) -> void:
	draw_string_outline(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, px, 6, Color(0.05, 0.05, 0.08))
	draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, px, color)
