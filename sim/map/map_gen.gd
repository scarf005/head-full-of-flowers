class_name MapGen
## Builds a TerrainMap from a seeded generator.


static func generate(_rng: RandomNumberGenerator, size: int = Defs.MAP_SIZE) -> TerrainMap:
	return TerrainMap.new(size)
