extends GutTest
## Match rules on an empty map: units 0 and 1 are enemies in a 2-unit free-for-all.

var w: SimWorld
var a: SimUnit
var b: SimUnit


func before_each() -> void:
	w = SimWorld.new({seed = 7, size = 2}, TerrainMap.new())
	a = w.units[0]
	b = w.units[1]
	a.pos = Vector2(0, 0)
	b.pos = Vector2(5, 0)
	a.aim = Vector2.RIGHT
	w.pickups.clear()
	w.bots_active = false


func _tick(count: int) -> void:
	for n in count:
		w.tick()


func test_hit_plants_flowers_for_attacker_team() -> void:
	Combat.damage(w, b, 2.0, 0, b.pos, Vector2(40, 0), &"shot")
	assert_eq(b.hp, 8.0)
	assert_gt(w.flowers.score(0), 0, "team 0 scores the petals")
	assert_eq(w.flowers.score(1), 0)


func test_teammates_take_no_damage() -> void:
	b.team = 0
	Combat.damage(w, b, 2.0, 0, b.pos, Vector2(40, 0), &"shot")
	assert_eq(b.hp, 10.0)
	assert_eq(w.flowers.score(0), 0)


func test_arena_damage_plants_burnt_flowers() -> void:
	Combat.damage(w, b, 1.0, -1, b.pos, Vector2.LEFT, &"arena")
	assert_gt(w.flowers.score(Defs.BURNT), 0)


func test_kill_heals_killer_and_respawns_target() -> void:
	a.hp = 5.0
	Combat.damage(w, b, 99.0, 0, b.pos, Vector2(40, 0), &"shot")
	assert_eq(a.hp, 8.0, "killer gains 3 HP")
	assert_eq(a.kills, 1)
	assert_eq(b.hp, b.max_hp)
	assert_gt(b.pos.length(), 20.0, "target respawns near the arena edge")
	assert_eq(w.pickups.size(), 1, "the kill drops a weapon")


func test_own_blast_kills() -> void:
	Combat.explode(w, a.pos, 3.8, 20.0, 0, true)
	assert_eq(a.deaths, 1)
	assert_gt(w.flowers.score(Defs.BURNT), 0)


func test_kevlar_takes_one_off_but_damage_is_at_least_one() -> void:
	Arsenal.apply_perk(b, &"kevlar_vest")
	Combat.damage(w, b, 3.0, 0, b.pos, Vector2.RIGHT, &"shot")
	assert_eq(b.hp, 8.0)
	Combat.damage(w, b, 1.0, 0, b.pos, Vector2.RIGHT, &"shot")
	assert_eq(b.hp, 7.0)


func test_pistol_shot_hits_enemy_in_line() -> void:
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	assert_eq(a.slot().ammo, 7.0)
	_tick(20)
	assert_lt(b.hp, 10.0)
	assert_eq(a.shots_hit, 1)


func test_empty_magazine_reloads_from_reserve() -> void:
	a.slot().ammo = 1.0
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	assert_gt(a.reload_cooldown, 0.0)
	_tick(80)
	assert_eq(a.slot().ammo, 8.0)


func test_empty_weapon_without_reserve_falls_back_to_pistol() -> void:
	Arsenal.equip(a, &"assault", 1.0)
	assert_eq(a.weapon_id(), &"assault")
	Combat.fire(w, a)
	assert_eq(a.weapon_id(), &"pistol")
	assert_eq(a.slots.size(), 1)


func test_battle_rifle_fires_three_round_burst() -> void:
	Arsenal.equip(a, &"battle-rifle", 20.0)
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(40)
	assert_eq(a.slot().ammo, 17.0)


func test_same_kind_higher_tier_replaces_and_ejects() -> void:
	Arsenal.equip(a, &"shotgun", 12.0)
	assert_eq(Arsenal.equip(a, &"auto-shotgun", 12.0), &"shotgun")
	assert_false(Arsenal.can_collect(a, &"shotgun"), "a lower tier of a held kind is refused")
	assert_eq(a.slots.size(), 2)


func test_same_weapon_adds_reserve_up_to_cap() -> void:
	Arsenal.equip(a, &"assault", 60.0)
	Arsenal.equip(a, &"assault", 60.0)
	Arsenal.equip(a, &"assault", 60.0)
	assert_eq(a.slot().ammo + a.slot().reserve, 180.0)
	Arsenal.equip(a, &"assault", 60.0)
	assert_eq(a.slot().ammo + a.slot().reserve, 180.0)


func test_third_weapon_replaces_lowest_tier_slot() -> void:
	Arsenal.equip(a, &"assault", 60.0)
	Arsenal.equip(a, &"shotgun", 12.0)
	assert_eq(a.slots.map(func(s: Dictionary) -> StringName: return s.id), [&"shotgun", &"assault"])


func test_extra_heart_stacks_four_times() -> void:
	for n in 5:
		Arsenal.apply_perk(a, &"extra_heart")
	assert_eq(a.max_hp, 22.0)


func test_bullet_breaks_box_and_box_drops_weapon() -> void:
	w.grid.set_cell(w.grid.cell_of(Vector2(3.5, 0.5)), Defs.Mat.BOX)
	a.pos = Vector2(0.5, 0.5)
	for n in 8:
		w.hit_cell(w.grid.cell_of(Vector2(3.5, 0.5)), 1.0)
	assert_false(w.grid.is_solid(w.grid.cell_of(Vector2(3.5, 0.5))))
	assert_eq(w.pickups.size(), 1)


func test_wall_armour_absorbs_two_damage() -> void:
	var cell := Vector2i(60, 60)
	w.grid.set_cell(cell, Defs.Mat.WALL)
	assert_eq(w.grid.damage_cell(cell, 2.0).dealt, 0.0)
	assert_eq(w.grid.damage_cell(cell, 5.0).destroyed, true)


func test_wall_stops_bullet() -> void:
	w.grid.set_cell(w.grid.cell_of(Vector2(2.5, 0.0)), Defs.Mat.ROCK)
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(30)
	assert_eq(b.hp, 10.0)


func test_unit_cannot_enter_solid_cell() -> void:
	w.grid.set_cell(w.grid.cell_of(Vector2(1.5, 0.5)), Defs.Mat.ROCK)
	a.pos = Vector2(0.5, 0.5)
	a.move = Vector2.RIGHT
	_tick(60)
	assert_lt(a.pos.x, 1.0 - a.radius + 0.01)


func test_marsh_slows_movement() -> void:
	a.move = Vector2.DOWN
	_tick(60)
	var fast := a.pos.y
	w.map.tiles.fill(TerrainMap.Tile.MARSH)
	a.pos = Vector2.ZERO
	a.vel = Vector2.ZERO
	_tick(60)
	assert_almost_eq(a.pos.y / fast, 0.45, 0.05)


func test_full_pool_recycles_oldest_flower_and_its_score() -> void:
	var field := FlowerField.new(4)
	var opts := {arena_radius = 40.0, now = 0.0}
	field.burst(w.rng, 0, Vector2.ZERO, Vector2.RIGHT, 4, 1.0, opts)
	field.burst(w.rng, 1, Vector2.ZERO, Vector2.RIGHT, 4, 1.0, opts)
	assert_eq(field.score(0), 0)
	assert_gt(field.score(1), 0)


func test_flame_patch_scorches_flowers() -> void:
	w.flowers.burst(w.rng, 1, Vector2(10, 10), Vector2.RIGHT, 20, 1.0, {arena_radius = 40.0, now = 0.0})
	var before := w.flowers.score(1)
	w.flowers.scorch(Vector2(10, 10), 5.0)
	assert_eq(w.flowers.score(1), 0)
	assert_eq(w.flowers.score(Defs.BURNT), before)


func test_thrown_grenade_kills_on_direct_hit() -> void:
	b.pos = Vector2(3, 0)
	a.want_throw = true
	_tick(1)
	a.want_throw = false
	assert_eq(a.secondary_cooldown_max, Defs.GRENADE_COOLDOWN)
	_tick(30)
	assert_eq(b.deaths, 1, "a direct grenade hit does 20 damage")


func test_unit_outside_arena_takes_border_damage() -> void:
	a.pos = Vector2(100, 0)
	_tick(1)
	assert_eq(a.hp, 9.0)
	assert_lt(a.pos.length(), w.arena_radius)


func test_match_ends_after_90_game_seconds_and_arena_shrinks() -> void:
	assert_eq(w.arena_radius, 30.0)
	_tick(7201)
	assert_true(w.finished)
	assert_almost_eq(w.arena_radius, 15.0, 0.1)


func test_same_seed_gives_same_match() -> void:
	var scores := []
	for run in 2:
		var world := SimWorld.new({seed = 3, size = 4}, TerrainMap.new())
		for n in 900:
			world.tick()
		scores.append([world.standings(), world.units[1].pos])
	assert_eq(scores[0], scores[1])


func test_team_modes_build_rosters() -> void:
	var tdm := SimWorld.new({mode = &"tdm", size = 3}, TerrainMap.new())
	assert_eq(tdm.units.map(func(u: SimUnit) -> int: return u.team), [0, 0, 0, 1, 1, 1])
	var squad := SimWorld.new({mode = &"squad", size = 3}, TerrainMap.new())
	assert_eq(squad.units.size(), 12)


func test_shot_leaves_a_shooter_who_touches_a_wall_behind() -> void:
	a.pos = Vector2(a.radius, 0.5)
	b.pos = Vector2(5, 0.5)
	w.grid.set_cell(w.grid.cell_of(Vector2(-0.5, 0.5)), Defs.Mat.ROCK)
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(20)
	assert_lt(b.hp, 10.0, "the wall behind the shooter does not take the shot")


func test_ricochet_shot_leaves_the_wall_it_hit() -> void:
	Arsenal.apply_perk(a, &"ricochet_shells")
	b.pos = Vector2(0, 20)
	var cell := w.grid.cell_of(Vector2(2.5, 0.0))
	w.grid.set_cell(cell, Defs.Mat.ROCK)
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(12)
	assert_eq(w.grid.hp[cell.y * w.grid.size + cell.x], Defs.MAT_HP[Defs.Mat.ROCK] - 2.0, "one hit on the wall")
	assert_eq(w.projectiles.size(), 1, "the shot is still in flight")


func test_shot_passes_over_a_prop_that_units_walk_through() -> void:
	w.grid.set_cell(w.grid.cell_of(Vector2(2.5, 0.0)), Defs.Mat.PROP, false, false)
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(20)
	assert_lt(b.hp, 10.0)


func test_projectile_count_stays_at_capacity_after_a_shotgun_blast() -> void:
	Arsenal.equip(a, &"shotgun", 12.0)
	Combat.fire(w, a)
	var pellet := w.projectiles[0]
	while w.projectiles.size() < Defs.PROJECTILE_CAPACITY:
		w.projectiles.append(pellet.duplicate())
	a.shoot_cooldown = 0.0
	Combat.fire(w, a)
	assert_eq(w.projectiles.size(), Defs.PROJECTILE_CAPACITY)
