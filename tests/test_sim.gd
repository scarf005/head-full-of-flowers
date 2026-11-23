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
	Combat.explode(w, a.pos, 3.8, 20.0, 0, true, &"grenade")
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


func test_no_flower_grows_in_a_solid_cell() -> void:
	# A wall 1 m in front of the hit: cells (1, -2) to (1, 2). 200 flowers fly along +x.
	for y in range(-2, 3):
		w.grid.set_cell(w.grid.cell_of(Vector2(1.5, y + 0.5)), Defs.Mat.WALL)
	var opts := {arena_radius = 40.0, now = 0.0, grid = w.grid}
	w.flowers.burst(w.rng, 1, Vector2(0.5, 0.5), Vector2.RIGHT, 200, 1.0, opts)
	assert_gt(w.flowers.score(1), 0)
	for i in w.flowers.capacity:
		if w.flowers.owner[i] == 1:
			assert_false(w.grid.is_solid(w.grid.cell_of(w.flowers.pos[i])), "flower at %s" % w.flowers.pos[i])


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


func test_ricochet_pellet_bounces_once_off_a_wall() -> void:
	Arsenal.apply_perk(a, &"ricochet_shells")
	Arsenal.equip(a, &"shotgun", 12.0)
	b.pos = Vector2(0, 20)
	for y in range(-4, 5):
		w.grid.set_cell(w.grid.cell_of(Vector2(2.5, y)), Defs.Mat.ROCK)
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(8)
	assert_eq(w.projectiles.size(), 8)
	assert_true(w.projectiles.all(func(p: Dictionary) -> bool: return p.ricochets >= 4), "4 of 5 bounces are left")


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


func test_hit_stop_slows_shots_but_not_units() -> void:
	a.move = Vector2.DOWN
	_tick(30)
	var before := a.pos.y
	w.hit_stop = 1.0
	Combat.fire(w, a)
	var shot_x: float = w.projectiles[0].pos.x
	_tick(10)
	assert_almost_eq(a.pos.y - before, a.speed * 10 * Defs.TICK * Defs.GAME_SPEED, 0.05)
	assert_lt(w.projectiles[0].pos.x - shot_x, 1.0, "the shot moves at 12% speed")


func test_weapon_appears_in_the_inner_half_every_8_to_12_seconds() -> void:
	_tick(roundi(12.5 / (Defs.TICK * Defs.GAME_SPEED)))
	assert_gt(w.pickups.size(), 0)
	assert_true(w.pickups.all(func(p: Dictionary) -> bool: return p.pos.length() <= w.arena_start * 0.5))


func test_timed_box_holds_a_high_tier_weapon() -> void:
	Loot.spawn_box(w)
	var boxes := range(w.grid.material.size()).filter(func(i: int) -> bool: return w.grid.material[i] == Defs.Mat.BOX)
	assert_eq(boxes.size(), 1)
	assert_eq(w.grid.high_tier[boxes[0]], 1)


func test_team_starts_together_and_away_from_the_other_teams() -> void:
	for config: Dictionary in [{mode = &"squad", size = 3}, {mode = &"duo", size = 6}, {mode = &"tdm", size = 6}]:
		config.seed = config.size
		var squads := SimWorld.new(config)
		for a in squads.units:
			assert_false(squads.grid.circle_hits(a.pos, a.radius), "unit %d stands free" % a.index)
			assert_lt(a.pos.length(), squads.arena_radius - a.radius, "unit %d is in the arena" % a.index)
			for b in squads.units:
				var gap := a.pos.distance_to(b.pos)
				if a.team == b.team:
					assert_lt(gap, 8.0, "team mates %d and %d" % [a.index, b.index])
				else:
					assert_gt(gap, 15.0, "enemies %d and %d" % [a.index, b.index])


func _kill_weapon() -> StringName:
	var kills := w.events.filter(func(e: Dictionary) -> bool: return e.type == &"hit" and e.kill and e.target == 1)
	return kills[0].weapon if not kills.is_empty() else &"none"


func test_rocket_kill_names_the_launcher_after_the_shooter_swaps_to_a_pistol() -> void:
	Arsenal.equip(a, &"rocket-launcher", 4.0)
	b.hp = 1.0
	Combat.fire(w, a)
	Arsenal.swap(a, 1)
	assert_eq(a.weapon_id(), &"pistol")
	_tick(40)
	assert_eq(_kill_weapon(), &"rocket-launcher")


func test_thrown_grenade_kill_names_the_grenade() -> void:
	b.hp = 1.0
	Shots.throw_secondary(w, a)
	_tick(40)
	assert_eq(_kill_weapon(), &"grenade")


func test_flame_patch_kill_names_the_flamethrower() -> void:
	b.hp = 1.0
	Shots.add_zone(w, b.pos, 0, &"flamethrower")
	_tick(80)
	assert_eq(_kill_weapon(), &"flamethrower")


func test_burst_shots_fan_out_by_the_burst_spread() -> void:
	Arsenal.equip(a, &"battle-rifle", 300.0)
	b.pos = Vector2(0, 30)
	var sums := [0.0, 0.0, 0.0]
	for burst in 400:
		w.projectiles.clear()
		a.shoot_cooldown = 0.0
		a.reload_cooldown = 0.0
		a.slot().ammo = 9.0
		Combat.fire(w, a)
		for n in 2:
			Combat.update_burst(w, a, 1.0)
		for n in 3:
			sums[n] += w.projectiles[n].vel.angle() / 400.0
	# The random spread of each shot adds to the fan, so compare the means of 400 bursts.
	assert_almost_eq(sums[0], -0.028, 0.012)
	assert_almost_eq(sums[1], 0.0, 0.012)
	assert_almost_eq(sums[2], 0.028, 0.012)


func test_grenade_launcher_shell_bursts_beside_an_enemy() -> void:
	# The shell flies along y = 0. The enemy stands 1.6 m beside that line, so the shell passes at about 0.9 m.
	Arsenal.equip(a, &"grenade-launcher", 6.0)
	b.pos = Vector2(6, 1.6)
	a.want_fire = true
	_tick(1)
	a.want_fire = false
	_tick(30)
	var bursts := w.events.filter(func(e: Dictionary) -> bool: return e.type == &"explosion")
	assert_eq(bursts.size(), 1)
	assert_lt(bursts[0].pos.x, 8.0, "the shell bursts beside the enemy, not at the end of its reach")
	assert_lt(b.hp, b.max_hp)
