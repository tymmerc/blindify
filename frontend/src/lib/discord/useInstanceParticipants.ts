import { useEffect, useState } from "react"
import { Events, type IDiscordSDK } from "@discord/embedded-app-sdk"

/**
 * Qui est dans le salon vocal, d'apres Discord : la liste au montage, puis
 * chaque arrivee ou depart. Ce n'est pas la liste des joueurs de la salle
 * (elle, c'est le lobby qui la tient) : c'est "qui pourrait encore entrer".
 * Les noms sont affiches par React en texte, jamais en HTML.
 */
export type InstanceParticipant = {
  id: string
  username: string
  global_name?: string | null
  nickname?: string | null
}

export type VoiceParticipant = { id: string; name: string }

/** Surnom sur le serveur, sinon nom d'affichage, sinon pseudo. */
export function participantName(p: InstanceParticipant): string {
  return p.nickname?.trim() || p.global_name?.trim() || p.username
}

export function useInstanceParticipants(sdk: IDiscordSDK | null): VoiceParticipant[] {
  const [list, setList] = useState<VoiceParticipant[]>([])

  useEffect(() => {
    if (!sdk) return
    let active = true
    const apply = (participants: InstanceParticipant[]) => {
      if (active) setList(participants.map(p => ({ id: p.id, name: participantName(p) })))
    }
    const onUpdate = (event: { participants: InstanceParticipant[] }) => apply(event.participants)

    sdk.commands
      .getInstanceConnectedParticipants()
      .then(result => apply(result.participants))
      .catch(() => {
        // Sans la liste, le lobby reste complet : cette bande est un plus.
      })
    sdk.subscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, onUpdate).catch(() => {})

    return () => {
      active = false
      sdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, onUpdate).catch(() => {})
    }
  }, [sdk])

  return list
}
