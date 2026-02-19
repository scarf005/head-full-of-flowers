import { t } from "@lingui/core/macro"

import type { GameModeId } from "../types.ts"

export const localizeFactionLabel = (mode: GameModeId, factionId: string, playerId: string) => {
  if (mode === "ffa") {
    if (factionId === playerId) {
      return t`You`
    }
    const botIndex = Number(factionId.replace("bot-", ""))
    if (Number.isFinite(botIndex) && botIndex > 0) {
      return t`Bot ${botIndex}`
    }
    return factionId
  }

  if (mode === "tdm") {
    if (factionId === "red") {
      return t`Red (You)`
    }
    if (factionId === "blue") {
      return t`Blue`
    }
    return factionId
  }

  const teamIndex = Number(factionId.replace("team-", ""))
  if (!Number.isFinite(teamIndex) || teamIndex <= 0) {
    return factionId
  }

  if (mode === "duo") {
    return teamIndex === 1 ? t`Duo 1 (You)` : t`Duo ${teamIndex}`
  }

  return teamIndex === 1 ? t`Squad 1 (You)` : t`Squad ${teamIndex}`
}
