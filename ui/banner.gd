class_name Banner
extends Control
## Short centred call-outs: match start, the last seconds and the match end.

var game: GameView
var _text := ""
var _color := Color.WHITE
var _ttl := 0.0
## Seconds since the call-out came. It starts large and shrinks to its size in 0.12 s.
var _age := 0.0
var _second := 11
## True while the player stands outside the arena border.
var _out := false


func setup(view: GameView) -> void:
	game = view
	_ttl = 0.0
	_second = 11
	game.event.connect(_on_event)


func say(text: String, color: Color, seconds: float) -> void:
	_age = 0.0
	_text = text
	_color = color
	_ttl = seconds


func _on_event(e: Dictionary) -> void:
	if game.autoplay:
		return
	if e.type == &"go":
		say(tr("GO"), Color.WHITE, 0.8)
	elif e.type == &"finish":
		# The results panel opens after 1.5 s and covers this place.
		say(tr("TIME"), Color.WHITE, 1.4)


func _process(delta: float) -> void:
	_ttl -= 0.0 if get_tree().paused else delta
	_age += delta
	var w := game.world
	_out = false
	if game.autoplay or w.finished:
		queue_redraw()
		return
	_out = game.player.pos.length() > w.arena_radius - game.player.radius - 0.05
	var second := ceili(w.time_left / Defs.GAME_SPEED)
	if second <= 10 and second < _second:
		_second = second
		say(str(second), Color.WHITE, 0.6)
		game.event.emit({type = &"tick"})
	queue_redraw()


func _draw() -> void:
	var font := get_theme_default_font()
	var at := Vector2(0.0, size.y * 0.3)
	if _out:
		# A line of its own, below the call-outs: the last seconds stay in view.
		var low := at + Vector2(0.0, 56.0)
		var warning := tr("Out of bounds")
		draw_string_outline(font, low, warning, HORIZONTAL_ALIGNMENT_CENTER, size.x, 32, 8, Color(0.05, 0.05, 0.08))
		draw_string(font, low, warning, HORIZONTAL_ALIGNMENT_CENTER, size.x, 32, Color(1.0, 0.4, 0.4))
	if _ttl <= 0.0:
		return
	# Steps of 16 px keep the pixel font sharp.
	var px := 64 + 16 * ceili(3.0 * clampf(1.0 - _age / 0.12, 0.0, 1.0))
	at.y += (px - 64) * 0.35
	draw_string_outline(font, at, _text, HORIZONTAL_ALIGNMENT_CENTER, size.x, px, 12, Color(0.05, 0.05, 0.08))
	draw_string(font, at, _text, HORIZONTAL_ALIGNMENT_CENTER, size.x, px, _color)
