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
      flowers: world.factionFlowerCounts[faction.id] ?? 0,
    }))
    .sort((left, right) => right.flowers - left.flowers)

  const winner = factionStandings[0]

  const burntCount = world.factionFlowerCounts[BURNED_FACTION_ID] ?? 0
  const total = factionStandings.reduce((sum, faction) => sum + faction.flowers, 0) + burntCount

  const standings = [...factionStandings]
  if (burntCount > 0) {
    standings.push({
      id: BURNED_FACTION_ID,
      label: t`Burnt`,
      color: BURNED_FACTION_COLOR,
      flowers: burntCount,
    })
  }

  const standingsWithPercent = standings
    .sort((left, right) => right.flowers - left.flowers)
    .map((faction) => ({
      ...faction,
      percent: total > 0 ? (100 * faction.flowers) / total : 100 / Math.max(1, standings.length),
    }))

  if (winner) {
    const isTeamBasedMode = currentMode !== "ffa"
    const playerTeamFlowers = world.factionFlowerCounts[playerCoverageId] ?? 0
    const playerFlowersOnTeam = isTeamBasedMode
      ? world.flowers.reduce((count, flower) => {
        if (!flower.active || flower.scorched || flower.ownerId !== playerCoverageId) {
          return count
        }

        return count + (flower.sourceOwnerId === world.player.id ? 1 : 0)
      }, 0)
      : 0
    const playerFlowerContributionPercent = playerTeamFlowers > 0 ? (playerFlowersOnTeam / playerTeamFlowers) * 100 : 0

    const message = winner.id === playerCoverageId
      ? t`Time up. Your trail dominates the arena`
      : t`Time up. ${winner.label} overwhelms the field`
    statusMessageSignal.value = message

    const winnerPercent = standingsWithPercent.find((entry) => entry.id === winner.id)?.percent ?? 0
    const runnerUpFlowers = factionStandings[1]?.flowers ?? 0
    const playerRank = Math.max(
      1,
      factionStandings.findIndex((faction) => faction.id === playerCoverageId) + 1,
    )
    const factionCount = factionStandings.length
    const shotsFired = world.playerBulletsFired
    const shotsHit = world.playerBulletsHit
    const hitRate = shotsFired > 0 ? Math.min(100, (shotsHit / shotsFired) * 100) : 0
    const stats = [
      { label: t`Total Flowers`, value: total.toLocaleString() },
      { label: t`Winner Share`, value: `${winnerPercent.toFixed(1)}%` },
      { label: t`Your Place`, value: `${playerRank}/${factionCount}` },
      ...(isTeamBasedMode
        ? [{ label: t`Team Contribution`, value: `${playerFlowerContributionPercent.toFixed(1)}%` }]
        : []),
      {
        label: t`Lead Margin`,
        value: t`${Math.max(0, winner.flowers - runnerUpFlowers)} flowers`,
      },
      { label: t`Bullets Fired`, value: shotsFired.toLocaleString() },
      { label: t`Bullets Hit`, value: shotsHit.toLocaleString() },
      { label: t`Hit Rate`, value: `${hitRate.toFixed(1)}%` },
      { label: t`Player Kills`, value: world.playerKills.toString() },
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
          percentOfTeam: playerFlowerContributionPercent,
        }
        : undefined,
    )
  }

  pausedSignal.value = false
}
