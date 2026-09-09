import { t } from "@lingui/core/macro"
import { clearMatchResultSignal, setMatchResultSignal } from "./adapters/hud-sync.ts"
import { BURNED_FACTION_COLOR, BURNED_FACTION_ID } from "./factions.ts"
import { pausedSignal, statusMessageSignal } from "./signals.ts"
import type { GameModeId } from "./types.ts"
import type { WorldState } from "./world/state.ts"

export function finishMatchResult(
  world: WorldState,
  currentMode: GameModeId,
  playerCoverageId: string,
) {
  clearMatchResultSignal()

  const factionStandings = world.factions
    .map((faction) => ({
      id: faction.id,
      label: faction.label,
      color: faction.color,
      petals: world.factionFlowerCounts[faction.id] ?? 0,
    }))
    .sort((left, right) => right.petals - left.petals)

  const winner = factionStandings[0]

  const burntCount = world.factionFlowerCounts[BURNED_FACTION_ID] ?? 0
  const total = factionStandings.reduce((sum, faction) => sum + faction.petals, 0) + burntCount

  const standings = [...factionStandings]
  if (burntCount > 0) {
    standings.push({
      id: BURNED_FACTION_ID,
      label: t`Burnt`,
      color: BURNED_FACTION_COLOR,
      petals: burntCount,
    })
  }

  const standingsWithPercent = standings
    .sort((left, right) => right.petals - left.petals)
    .map((faction) => ({
      ...faction,
      percent: total > 0 ? (100 * faction.petals) / total : 100 / Math.max(1, standings.length),
    }))

  if (winner) {
    const isTeamBasedMode = currentMode !== "ffa"
    const playerTeamPetals = world.factionFlowerCounts[playerCoverageId] ?? 0
    const playerPetalsOnTeam = isTeamBasedMode
      ? world.flowers.reduce((count, flower) => {
        if (!flower.active || flower.scorched || flower.ownerId !== playerCoverageId) {
          return count
        }

        return count + (flower.sourceOwnerId === world.player.id ? flower.petalCount : 0)
      }, 0)
      : 0
    const playerPetalContributionPercent = playerTeamPetals > 0 ? (playerPetalsOnTeam / playerTeamPetals) * 100 : 0

    const message = winner.id === playerCoverageId
      ? t`Time up. Your trail dominates the arena`
      : t`Time up. ${winner.label} overwhelms the field`
    statusMessageSignal.value = message

    const winnerPercent = standingsWithPercent.find((entry) => entry.id === winner.id)?.percent ?? 0
    const runnerUpPetals = factionStandings[1]?.petals ?? 0
    const playerRank = Math.max(
      1,
      factionStandings.findIndex((faction) => faction.id === playerCoverageId) + 1,
    )
    const factionCount = factionStandings.length
    const shotsFired = world.playerBulletsFired
    const shotsHit = world.playerBulletsHit
    const hitRate = shotsFired > 0 ? Math.min(100, (shotsHit / shotsFired) * 100) : 0
    const stats = [
      { label: t`Total Petals`, value: total.toLocaleString() },
      { label: t`Winner Share`, value: `${winnerPercent.toFixed(1)}%` },
      { label: t`Your Place`, value: `${playerRank}/${factionCount}` },
      ...(isTeamBasedMode
        ? [{ label: t`Team Contribution`, value: `${playerPetalContributionPercent.toFixed(1)}%` }]
        : []),
      {
        label: t`Lead Margin`,
        value: t`${Math.max(0, winner.petals - runnerUpPetals)} petals`,
      },
      { label: t`Bullets Fired`, value: shotsFired.toLocaleString() },
      { label: t`Bullets Hit`, value: shotsHit.toLocaleString() },
      { label: t`Hit Rate`, value: `${hitRate.toFixed(1)}%` },
      { label: t`Player Kills`, value: world.playerKills.toString() },
      { label: t`Deaths`, value: world.playerDeaths.toString() },
      { label: t`Damage`, value: Math.round(world.playerDamageDealt).toLocaleString() },
    ]

    setMatchResultSignal(
      { label: winner.label, color: winner.color },
      standingsWithPercent.map((entry) => ({
        id: entry.id,
        color: entry.color,
        percent: entry.percent,
      })),
      stats,
      standingsWithPercent,
      isTeamBasedMode
        ? {
          teamId: playerCoverageId,
          percentOfTeam: playerPetalContributionPercent,
        }
        : undefined,
    )
  }

  pausedSignal.value = false
}
