class_name Hud
extends Control
## In-match overlay: score bar, timer, health, ammo, kill feed, minimap and crosshair.

const MAP_PX := 150.0
const INK := Color(0.05, 0.05, 0.08)
const PLATE := Color(0.05, 0.05, 0.08, 0.88)
const RED := Color(0.95, 0.3, 0.35)
## Pixels from the screen border to the arrows of units out of view, and from an arrow to a corner.
const EDGE := 32.0
## Offsets that stamp an ink rim around each icon.
const RIM: Array[Vector2] = [
	Vector2(-2, 0),
	Vector2(2, 0),
	Vector2(0, -2),
	Vector2(0, 2),
	Vector2(-2, -2),
	Vector2(2, -2),
	Vector2(-2, 2),
	Vector2(2, 2)
]

var game: GameView
var feed: Array[Dictionary] = []
var _map := ImageTexture.new()
var _map_revision := -1
## Seconds left of the hit marker at the crosshair.
var _marker := 0.0
var _marker_color := Color.WHITE


func setup(view: GameView) -> void:
	game = view
	feed.clear()
	_map_revision = -1
	if not game.event.is_connected(_on_event):
		game.event.connect(_on_event)


## Where the arrow for a unit at the screen point `at` goes: on the border of `area`, on the line from the middle of
## the screen to the unit, and not nearer than EDGE to a corner. As in the original game.
static func edge_point(at: Vector2, area: Rect2) -> Vector2:
	var centre := area.get_center()
	var to := at - centre
	var inner := area.grow(-EDGE)
	if absf(to.x) * area.size.y >= absf(to.y) * area.size.x:
		var x := area.end.x if to.x >= 0.0 else area.position.x
		return Vector2(x, clampf(centre.y + to.y * (x - centre.x) / to.x, inner.position.y, inner.end.y))
	var y := area.end.y if to.y >= 0.0 else area.position.y
	return Vector2(clampf(centre.x + to.x * (y - centre.y) / to.y, inner.position.x, inner.end.x), y)


## Moves the arrow at `spot` off each plate of the HUD, to the side of the plate that is toward the middle of a
## screen of this width.
static func beside(spot: Vector2, plates: Array[Rect2], width: float) -> Vector2:
	for plate in plates:
		if plate.grow(20.0).has_point(spot):
			spot.x = plate.end.x + 24.0 if plate.get_center().x < width * 0.5 else plate.position.x - 24.0
	return spot


static func unit_name(u: SimUnit) -> String:
	return TranslationServer.translate("You") if u.is_player else TranslationServer.translate("Bot %d") % u.index


func _process(delta: float) -> void:
	# A pause stops the timers, but the HUD draws again so that the crosshair goes away.
	var step := 0.0 if get_tree().paused else delta
	for row in feed:
		row.ttl -= step
	_marker -= step
	feed = feed.filter(func(row: Dictionary) -> bool: return row.ttl > 0.0)
	queue_redraw()


func _on_event(e: Dictionary) -> void:
	if e.type == &"hit" and e.source == 0 and e.target != 0:
		_marker = 0.3 if e.kill else 0.15
		_marker_color = RED if e.kill else Color.WHITE
	if e.type != &"hit" or not e.kill:
		return
	var w := game.world
	var victim := w.units[e.target]
	var row := {killer = "", killer_color = Color.WHITE, victim = unit_name(victim), ttl = 4.0, icon = &"skull"}
	row.victim_color = w.team_color(victim.team)
	if e.source >= 0 and e.source != e.target:
		row.killer = unit_name(w.units[e.source])
		row.killer_color = w.team_color(e.team)
		row.icon = e.weapon if e.weapon != &"" else &"skull"
	feed.append(row)
	if feed.size() > 5:
		feed.pop_front()


func _draw() -> void:
	if game == null or game.world == null:
		return
	var w := game.world
	var p := game.player
	var font := get_theme_default_font()
	# Score bar: one segment per team, sized by its petals. A petal and the score mark the player's team.
	var total := 0
	for row in w.standings():
		total += row.petals
	var bar := Rect2(size.x * 0.25, 12.0, size.x * 0.5, 14.0)
	draw_rect(bar.grow(2.0), INK)
	var x := bar.position.x
	var own := Rect2()
	for team in w.team_count:
		# Before the first petal, the bar is empty.
		var share := w.flowers.score(team) / float(maxi(total, 1))
		var segment := Rect2(x, bar.position.y, bar.size.x * share, bar.size.y)
		draw_rect(segment, w.team_color(team))
		own = segment if team == p.team else own
		x += segment.size.x
	if own.size.x > 0.0:
		draw_rect(own.grow(1.0), Color.WHITE, false, 2.0)
	var mark := clampf(own.get_center().x - 8.0, bar.position.x, bar.end.x - 64.0)
	var count := "%d" % w.flowers.score(p.team)
	# The plates of the HUD, with the map first. The arrows of units out of view stay off them.
	var plates: Array[Rect2] = [Rect2(16.0, 16.0, MAP_PX, MAP_PX)]
	plates.append(
		Rect2(mark - 4.0, 30.0, 30.0 + font.get_string_size(count, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x, 20.0)
	)
	draw_rect(plates[-1], PLATE)
	_icon(&"petal", Rect2(mark, 32.0, 16.0, 16.0), w.team_color(p.team))
	_text(font, Vector2(mark + 22.0, 46.0), count, w.team_color(p.team), 16)
	# Timer: red in the last 10 s, with a pulse on each second.
	var clock_color := Color.WHITE
	# The sim clock runs at GAME_SPEED. Show wall-clock seconds.
	var left := w.time_left / Defs.GAME_SPEED
	if left < 10.0:
		clock_color = Color(1.0, 0.25, 0.25).lerp(Color(0.5, 0.05, 0.05), 1.0 - fposmod(left, 1.0))
	_icon(&"clock", Rect2(bar.end.x + 12.0, 3.0, 32.0, 32.0), clock_color)
	var clock := "%d:%02d" % [int(left) / 60, int(left) % 60]
	_text(font, Vector2(bar.end.x + 50.0, 28.0), clock, clock_color, 24)
	# Hearts, one per hit point, on a dark plate like the map and the feed.
	draw_rect(Rect2(8.0, size.y - 40.0, 12.0 + p.max_hp * 20.0, 32.0), PLATE)
	# The hearts with the perks above them.
	plates.append(Rect2(8.0, size.y - 72.0, maxf(12.0 + p.max_hp * 20.0, 8.0 + p.perks.size() * 40.0), 64.0))
	for pip in int(p.max_hp):
		var full := pip < ceili(p.hp)
		_icon(&"heart", Rect2(16.0 + pip * 20.0, size.y - 32.0, 16.0, 16.0), RED if full else Color(0.3, 0.3, 0.34))
	# Perks with a stack count.
	var perk_x := 16.0
	for id: StringName in p.perks:
		_icon(id, Rect2(perk_x, size.y - 72.0, 32.0, 32.0), Color(0.6, 1.0, 0.9))
		if p.perks[id] > 1:
			_text(font, Vector2(perk_x + 24.0, size.y - 40.0), str(p.perks[id]), Color.WHITE, 16)
		perk_x += 40.0
	# Weapon slots, ammo, reload and secondary.
	var right := size.x - 16.0
	var slot := p.slot()
	var ammo_x := right - 164.0
	plates.append(Rect2(ammo_x - 120.0, size.y - 88.0, right - ammo_x + 128.0, 80.0))
	draw_rect(plates[-1], PLATE)
	_icon(slot.id, Rect2(ammo_x - 72.0, size.y - 80.0, 64.0, 64.0), Color.WHITE)
	for i in p.slots.size():
		if i != p.slot_index:
			_icon(p.slots[i].id, Rect2(ammo_x - 112.0, size.y - 64.0, 32.0, 32.0), Color(0.6, 0.6, 0.65))
	var reserve := "--" if is_inf(slot.reserve) else str(int(slot.reserve))
	var ammo := str(int(slot.ammo))
	_text(font, Vector2(ammo_x, size.y - 30.0), ammo, Color.WHITE, 32)
	var reserve_x := ammo_x + 4.0 + font.get_string_size(ammo, HORIZONTAL_ALIGNMENT_LEFT, -1, 32).x
	_text(font, Vector2(reserve_x, size.y - 30.0), "/ " + reserve, Color(0.75, 0.75, 0.75), 24)
	if p.reload_cooldown > 0.0:
		var part := 1.0 - p.reload_cooldown / p.reload_cooldown_max
		draw_rect(Rect2(ammo_x, size.y - 22.0, 88.0, 6.0), INK)
		draw_rect(Rect2(ammo_x + 1.0, size.y - 21.0, 86.0 * part, 4.0), Color.WHITE)
	# Secondary: dim while it recharges, refilled from the bottom up.
	var ready := clampf(1.0 - p.secondary_cooldown / maxf(0.01, p.secondary_cooldown_max), 0.0, 1.0)
	var at := Rect2(right - 32.0, size.y - 64.0, 32.0, 32.0)
	_icon(p.secondary, at, Color(0.35, 0.35, 0.38) if ready < 1.0 else Color(1.0, 0.7, 0.3))
	if ready < 1.0:
		var cut := roundf(32.0 * (1.0 - ready))
		var fill := Rect2(at.position.x, at.position.y + cut, 32.0, 32.0 - cut)
		draw_texture_rect_region(
			Icons.get_icon(p.secondary), fill, Rect2(0.0, cut, 32.0, 32.0 - cut), Color(0.8, 0.55, 0.25)
		)
	# Kill feed, right aligned: killer, what killed, victim.
	for i in feed.size():
		var row: Dictionary = feed[i]
		var base := 34.0 + i * 26.0
		var end := right - font.get_string_size(row.victim, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
		var start := end - 32.0 - font.get_string_size(row.killer, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
		plates.append(Rect2(start - 6.0, base - 19.0, right - start + 12.0, 25.0))
		draw_rect(plates[-1], PLATE)
		_text(font, Vector2(end, base), row.victim, row.victim_color, 16)
		_icon(row.icon, Rect2(end - 28.0, base - 18.0, 24.0, 24.0), Color.WHITE)
		_text(font, Vector2(start, base), row.killer, row.killer_color, 16)
	_draw_map(w)
	# Crosshair.
	if get_tree().paused or w.finished:
		return
	_draw_arrows(w, font, plates)
	var mouse := game.crosshair()
	for arm: Vector2 in [Vector2.RIGHT, Vector2.LEFT, Vector2.UP, Vector2.DOWN]:
		draw_line(mouse + arm * 5.0, mouse + arm * 17.0, INK, 7.0)
	draw_rect(Rect2(mouse - Vector2(3.0, 3.0), Vector2(6.0, 6.0)), INK)
	draw_rect(Rect2(mouse - Vector2(1.0, 1.0), Vector2(2.0, 2.0)), Color.WHITE)
	for arm: Vector2 in [Vector2.RIGHT, Vector2.LEFT, Vector2.UP, Vector2.DOWN]:
		draw_line(mouse + arm * 7.0, mouse + arm * 15.0, Color.WHITE, 3.0)
		if _marker > 0.0:
			var slant := arm.rotated(PI / 4.0)
			draw_line(mouse + slant * 8.0, mouse + slant * 18.0, INK, 6.0)
			draw_line(mouse + slant * 8.0, mouse + slant * 18.0, _marker_color, 3.0)
	if p.reload_cooldown > 0.0:
		var turn := TAU * (1.0 - p.reload_cooldown / p.reload_cooldown_max)
		draw_arc(mouse, 22.0, -PI / 2.0, -PI / 2.0 + TAU, 32, INK, 6.0)
		draw_arc(mouse, 22.0, -PI / 2.0, -PI / 2.0 + turn, 32, Color.WHITE, 3.0)


## An arrow in the team colour at the screen border for each unit that is not fully in view, with its distance in
## metres. As in the original game.
func _draw_arrows(w: SimWorld, font: Font, plates: Array[Rect2]) -> void:
	var screen := Rect2(Vector2.ZERO, size)
	var to_hud := size / Vector2(game.get_viewport().get_visible_rect().size)
	for u in w.units:
		# The middle of the body. The body is 20 pixels wide on each side of it.
		var at := game.camera.unproject_position(Vector3(u.pos.x, 0.6, u.pos.y)) * to_hud
		if u == game.player or screen.grow(-20.0).has_point(at):
			continue
		# Under the score bar at the top.
		var area := screen.grow_individual(-EDGE, -60.0, -EDGE, -EDGE)
		var spot := beside(edge_point(at, area), plates, size.x)
		var dir := (at - area.get_center()).normalized()
		var side := dir.orthogonal()
		var back := spot - dir * 4.0
		draw_colored_polygon([spot + dir * 22.0, back + side * 14.0, back - side * 14.0], INK)
		draw_colored_polygon([spot + dir * 16.0, spot + side * 9.0, spot - side * 9.0], w.team_color(u.team))
		var label := "%dm" % roundi(u.pos.distance_to(game.player.pos))
		var width := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
		_text(font, spot - dir * 26.0 + Vector2(-width * 0.5, 6.0), label, Color.WHITE, 16)


func _draw_map(w: SimWorld) -> void:
	if w.grid.revision != _map_revision:
		_map_revision = w.grid.revision
		var image := Image.create(w.grid.size, w.grid.size, false, Image.FORMAT_RGBA8)
		for i in w.grid.solid.size():
			if w.grid.solid[i] and w.grid.material[i] != Defs.Mat.DOOR:
				image.set_pixel(i % w.grid.size, i / w.grid.size, Color(1, 1, 1, 0.55))
		_map.set_image(image)
	var origin := Vector2(16.0, 16.0)
	var scale := MAP_PX / (w.arena_start * 2.0)
	var centre := origin + Vector2.ONE * MAP_PX * 0.5
	# Thinner than the other plates: units walk under the map.
	draw_rect(Rect2(origin, Vector2.ONE * MAP_PX), Color(PLATE, 0.45))
	var shown := Rect2(Vector2.ONE * (w.grid.size * 0.5 - w.arena_start), Vector2.ONE * w.arena_start * 2.0)
	draw_texture_rect_region(_map, Rect2(origin, Vector2.ONE * MAP_PX), shown)
	draw_arc(centre, w.arena_radius * scale, 0.0, TAU, 48, Color(1.0, 0.4, 0.35), 2.0)
	for pickup in w.pickups:
		draw_rect(Rect2(centre + pickup.pos * scale - Vector2.ONE * 1.5, Vector2.ONE * 3.0), Color(1.0, 0.85, 0.3))
	for u in w.units:
		draw_circle(centre + u.pos * scale, 4.0 if u.is_player else 3.0, w.team_color(u.team))
	draw_arc(centre + w.units[0].pos * scale, 6.0, 0.0, TAU, 12, Color.WHITE, 1.0)


func _icon(id: StringName, at: Rect2, color: Color) -> void:
	var texture := Icons.get_icon(id)
	for offset in RIM:
		draw_texture_rect(texture, Rect2(at.position + offset, at.size), false, Color(INK, color.a))
	draw_texture_rect(texture, at, false, color)


func _text(font: Font, at: Vector2, text: String, color: Color, px: int) -> void:
	draw_string_outline(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, px, 6, INK)
	draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, px, color)
