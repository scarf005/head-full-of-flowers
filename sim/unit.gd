class_name SimUnit
## One fighter: the player or a bot.

var index := 0
var is_player := false
var team := 0
var pos := Vector2.ZERO
var vel := Vector2.ZERO
var aim := Vector2.RIGHT
var radius := Defs.BOT_RADIUS
var speed := Defs.UNIT_SPEED
var max_hp := Defs.UNIT_HP
var hp := Defs.UNIT_HP
var shoot_cooldown := 0.0
var secondary_cooldown := 0.0
var secondary_cooldown_max := 0.0
var reload_cooldown := 0.0
var reload_cooldown_max := 0.0
## Each slot: {id, ammo, reserve, seq}.
var slots: Array[Dictionary] = []
var slot_index := 0
var slot_seq := 0
var secondary := &"grenade"
var fire_rate_mul := 1.0
var bullet_size_mul := 1.0
var reload_speed_mul := 1.0
var next_reload_mul := 1.0
var damage_reduction := 0.0
var range_mul := 1.0
var damage_bonus := 0.0
var proximity_bonus := 0.0
var aim_assist := 0.0
var perks := {}
var kills := 0
var deaths := 0
var hit_flash := 0.0
var recoil := 0.0
var border_cooldown := 0.0
var burst_left := 0
var burst_total := 0
var burst_index := 0
var burst_spread := 0.0
var burst_interval := 0.0
var burst_weapon := &""
var burst_timer := 0.0
var shots_fired := 0
var shots_hit := 0
var damage_dealt := 0.0
# Input for this tick, written by the player adapter or the bot brain.
var move := Vector2.ZERO
var want_fire := false
var want_throw := false
var want_reload := false
var want_swap := 0
# Bot brain state.
var ai_state := &"wander"
var ai_timer := 0.0
var ai_move := Vector2.RIGHT
var ai_path: PackedVector2Array = []
var ai_path_timer := 0.0
var ai_aim_error := 0.0


func has_perk(id: StringName) -> bool:
	return perks.get(id, 0) > 0


func slot() -> Dictionary:
	return slots[slot_index]


func weapon_id() -> StringName:
	return slots[slot_index].id


func reset_for_match() -> void:
	radius = Defs.PLAYER_RADIUS if is_player else Defs.BOT_RADIUS
	speed = Defs.UNIT_SPEED
	max_hp = Defs.UNIT_HP
	fire_rate_mul = 1.0
	bullet_size_mul = 1.0
	reload_speed_mul = 1.0
	next_reload_mul = 1.0
	damage_reduction = 0.0
	range_mul = 1.0
	damage_bonus = 0.0
	proximity_bonus = 0.0
	aim_assist = 0.0
	perks = {}
	kills = 0
	deaths = 0
	shots_fired = 0
	shots_hit = 0
	damage_dealt = 0.0
	slots = []
	slot_index = 0
	slot_seq = 0


func respawn(at: Vector2) -> void:
	pos = at
	vel = Vector2.ZERO
	hp = max_hp
	shoot_cooldown = 0.0
	secondary_cooldown = 0.0
	secondary_cooldown_max = 0.0
	reload_cooldown = 0.0
	reload_cooldown_max = 0.0
	ai_timer = 0.0
	ai_path = []
	hit_flash = 0.0
	recoil = 0.0
	border_cooldown = 0.0
	clear_burst()


func clear_burst() -> void:
	burst_left = 0
	burst_total = 0
	burst_index = 0
	burst_spread = 0.0
	burst_interval = 0.0
	burst_weapon = &""
