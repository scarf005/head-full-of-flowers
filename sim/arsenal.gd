class_name Arsenal
## Weapon slots, reload and perks of a unit.


static func tier(id: StringName) -> int:
	return Defs.WEAPONS[id].tier


## True when `equip` will take the weapon.
static func can_collect(unit: SimUnit, id: StringName) -> bool:
	var lowest := 99
	for s in unit.slots:
		lowest = mini(lowest, tier(s.id))
		if Defs.WEAPONS[s.id].kind == Defs.WEAPONS[id].kind:
			return s.id == id or tier(s.id) <= tier(id)
	return unit.slots.size() < Defs.PRIMARY_SLOT_CAP or tier(id) >= lowest


## Gives a weapon with `ammo` rounds. Returns the weapon that left its slot, or &"".
static func equip(unit: SimUnit, id: StringName, ammo: float) -> StringName:
	var weapon: Dictionary = Defs.WEAPONS[id]
	var target := -1
	for i in unit.slots.size():
		var s := unit.slots[i]
		if s.id == id:
			if not is_inf(s.reserve):
				s.reserve = minf(Defs.ammo_cap(id) - s.ammo, s.reserve + ammo)
			return &""
		if Defs.WEAPONS[s.id].kind == weapon.kind:
			if tier(s.id) > weapon.tier:
				return &""
			target = i
	if target < 0 and unit.slots.size() >= Defs.PRIMARY_SLOT_CAP:
		target = 0
		for i in unit.slots.size():
			var a := unit.slots[i]
			var b := unit.slots[target]
			if tier(a.id) < tier(b.id) or (tier(a.id) == tier(b.id) and a.seq < b.seq):
				target = i
		if tier(unit.slots[target].id) > weapon.tier:
			return &""
	var loaded := minf(weapon.mag, ammo)
	var slot := {id = id, ammo = loaded, reserve = ammo - loaded, seq = unit.slot_seq}
	unit.slot_seq += 1
	var ejected := &""
	if target < 0:
		unit.slots.append(slot)
		target = unit.slots.size() - 1
	else:
		ejected = unit.slots[target].id
		unit.slots[target] = slot
	unit.slot_index = target
	cancel_actions(unit)
	return ejected


static func cancel_actions(unit: SimUnit) -> void:
	unit.reload_cooldown = 0.0
	unit.reload_cooldown_max = 0.0
	unit.clear_burst()


static func swap(unit: SimUnit, step: int) -> void:
	if unit.slots.size() < 2:
		return
	unit.slot_index = posmod(unit.slot_index + step, unit.slots.size())
	cancel_actions(unit)


static func start_reload(unit: SimUnit) -> bool:
	var s := unit.slot()
	var weapon: Dictionary = Defs.WEAPONS[s.id]
	if unit.reload_cooldown > 0.0 or s.ammo >= weapon.mag or s.reserve <= 0.0:
		return false
	unit.reload_cooldown = weapon.reload * unit.next_reload_mul / unit.reload_speed_mul
	unit.reload_cooldown_max = unit.reload_cooldown
	unit.next_reload_mul = 1.0
	unit.clear_burst()
	return true


static func finish_reload(unit: SimUnit) -> void:
	var s := unit.slot()
	var moved := minf(Defs.WEAPONS[s.id].mag - s.ammo, s.reserve)
	s.ammo += moved
	s.reserve -= moved
	unit.reload_cooldown = 0.0
	unit.reload_cooldown_max = 0.0


## Removes the empty active slot and selects a weapon that can fire. The pistol is the fallback.
static func drop_empty(unit: SimUnit) -> void:
	unit.slots.remove_at(unit.slot_index)
	if unit.slots.is_empty():
		equip(unit, &"pistol", INF)
	unit.slot_index = 0
	cancel_actions(unit)


## Returns true when the perk was applied. A perk at its stack limit is not applied.
static func apply_perk(unit: SimUnit, id: StringName) -> bool:
	var stacks: int = unit.perks.get(id, 0)
	if stacks >= Defs.PERKS[id].max:
		return false
	unit.perks[id] = stacks + 1
	match id:
		&"laser_sight":
			unit.aim_assist = 0.22
			unit.range_mul = 1.2
		&"proximity_grenades":
			unit.proximity_bonus = 0.45
		&"rapid_reload":
			unit.reload_speed_mul = 1.25
		&"heavy_pellets":
			unit.bullet_size_mul = 1.5
			unit.fire_rate_mul = 0.75
			unit.damage_bonus = 1.0
		&"extra_heart":
			unit.max_hp += 3.0
			unit.hp = minf(unit.max_hp, unit.hp + 3.0)
		&"extra_stamina":
			unit.speed = Defs.UNIT_SPEED * 1.12
		&"kevlar_vest":
			unit.damage_reduction = 1.0
	return true
