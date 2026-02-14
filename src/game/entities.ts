import type { AIState, PrimaryWeaponId, SecondaryMode, Team } from "./types.ts"

export class Vec2 {
  x: number
  y: number

  constructor(x = 0, y = 0) {
    this.x = x
    this.y = y
  }

  set(x: number, y: number) {
    this.x = x
    this.y = y
    return this
  }

  copy(v: Vec2) {
    this.x = v.x
    this.y = v.y
    return this
  }

  clone() {
    return new Vec2(this.x, this.y)
  }

  add(v: Vec2) {
    this.x += v.x
    this.y += v.y
    return this
  }

  subtract(v: Vec2) {
    this.x -= v.x
    this.y -= v.y
    return this
  }

  scale(s: number) {
    this.x *= s
    this.y *= s
    return this
  }

  length() {
    return Math.hypot(this.x, this.y)
  }

  normalize() {
    const len = this.length() || 1
    this.x /= len
    this.y /= len
    return this
  }

  dot(v: Vec2) {
    return this.x * v.x + this.y * v.y
  }
}

export class Unit {
  id: string
  isPlayer: boolean
  team: Team
  position = new Vec2()
  velocity = new Vec2()
  aim = new Vec2(1, 0)
  radius = 14
  speed = 175
  maxHp = 10
  hp = 10
  shootCooldown = 0
  secondaryCooldown = 0
  reloadCooldown = 0
  primaryWeapon: PrimaryWeaponId = "pistol"
  primaryAmmo = Number.POSITIVE_INFINITY
  reserveAmmo = Number.POSITIVE_INFINITY
  magazineSize = Number.POSITIVE_INFINITY
  secondaryMode: SecondaryMode = "grenade"
  damageMultiplier = 1
  fireRateMultiplier = 1
  bulletSizeMultiplier = 1
  aiState: AIState = "wander"
  aiDecisionTimer = 0
  aiMove = new Vec2(1, 0)
  grenadeTimer = 2
  hitFlash = 0
  recoil = 0

  constructor(id: string, isPlayer: boolean, team: Team) {
    this.id = id
    this.isPlayer = isPlayer
    this.team = team
  }

  respawn(position: Vec2) {
    this.position.copy(position)
    this.velocity.set(0, 0)
    this.hp = this.maxHp
    this.shootCooldown = 0
    this.secondaryCooldown = 0
    this.reloadCooldown = 0
    this.aiDecisionTimer = 0
    this.hitFlash = 0
    this.recoil = 0
  }
}

export class Projectile {
  active = false
  ownerId = ""
  ownerTeam: Team = "white"
  position = new Vec2()
  velocity = new Vec2()
  radius = 6
  damage = 10
  maxRange = 500
  traveled = 0
  ttl = 0
  glow = 0.5
}

export class Throwable {
  active = false
  ownerId = ""
  ownerTeam: Team = "white"
  mode: SecondaryMode = "grenade"
  position = new Vec2()
  velocity = new Vec2()
  life = 0.9
  radius = 7
}

export class Flower {
  active = false
  team: Team = "white"
  ownerId = ""
  color = "#f7ffef"
  accent = "#e5efcf"
  position = new Vec2()
  size = 0
  targetSize = 4
  pop = 0
}

export class DamagePopup {
  active = false
  position = new Vec2()
  velocity = new Vec2()
  text = ""
  color = "#fff"
  life = 0
}

export class Pickup {
  active = false
  weapon: PrimaryWeaponId = "assault"
  position = new Vec2()
  radius = 16
  bob = 0
}

export class MolotovZone {
  active = false
  ownerId = ""
  ownerTeam: Team = "white"
  position = new Vec2()
  radius = 54
  life = 2
  tick = 0
}

export class Obstacle {
  active = false
  id = ""
  kind: "box" | "house" = "box"
  position = new Vec2()
  width = 2
  height = 2
  hp = 0
  maxHp = 0
  lootDropped = false
  tiles: boolean[][] = []
}
