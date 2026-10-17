"use client"

import { useState } from "react"
import { Settings, X } from "lucide-react"
import { api } from "@/lib/api"
import { setApiBearerToken } from "@/lib/apiClient"
import { disconnectSocket } from "@/lib/socket"

/**
 * Le petit menu de l'Activite Discord (decision de Tym du 10/10/2026) : ce que
 * Blindz garde du joueur, et la suppression de son compte, comme dans les
 * Reglages du site. Meme route serveur (DELETE /api/auth/account, la session
 * Bearer suffit). Confirmation dans la page : window.confirm est bloque dans
 * l'iframe de Discord.
 */
type Props = { onDeleted: () => void }

type Stage = "closed" | "open" | "confirm" | "deleting"

export function DiscordMenu({ onDeleted }: Props) {
  const [stage, setStage] = useState<Stage>("closed")
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setStage("deleting")
    setError(null)
    try {
      await api.deleteAccount()
      setApiBearerToken(null)
      disconnectSocket()
      onDeleted()
    } catch (err) {
      console.error("discord_delete_account_failed", err)
      setError("La suppression n'a pas abouti. Réessaie dans un instant.")
      setStage("confirm")
    }
  }

  if (stage === "closed") {
    return (
      <button
        type="button"
        onClick={() => setStage("open")}
        aria-label="Réglages"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#2e2014] bg-[#f4ecdb] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
      >
        <Settings className="h-4 w-4" aria-hidden />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2e2014]/40 p-4" onClick={() => stage !== "deleting" && setStage("closed")}>
      <section
        role="dialog"
        aria-label="Réglages"
        className="w-full max-w-sm rounded-md border-2 border-[#2e2014] bg-[#f4ecdb] p-5 text-[#2e2014] shadow-[6px_6px_0_rgba(46,32,20,.25)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="m-0 font-display text-lg font-semibold">Ton compte</h2>
          <button
            type="button"
            onClick={() => setStage("closed")}
            disabled={stage === "deleting"}
            aria-label="Fermer"
            className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="m-0 text-sm text-[#6b573f]">
          Blindz garde ton identifiant Discord, ton pseudo et ton avatar, avec ta musique importée et tes parties.
          Pas d&apos;e-mail, pas de liste de serveurs ni d&apos;amis.
        </p>
        {stage === "open" ? (
          <button
            type="button"
            onClick={() => setStage("confirm")}
            className="mt-4 w-full rounded-md border-2 border-[#9c2f1d] bg-transparent px-4 py-2.5 text-sm font-bold text-[#9c2f1d] transition hover:bg-[#9c2f1d] hover:text-[#f4ecdb]"
          >
            Supprimer mon compte
          </button>
        ) : (
          <div className="mt-4 rounded-md border-2 border-[#9c2f1d] bg-[#efe5d0] p-3">
            <p className="m-0 text-sm font-semibold text-[#9c2f1d]">
              C&apos;est définitif : ton compte, ta musique importée et tes parties sont effacés.
            </p>
            {error ? <p className="m-0 mt-2 text-sm font-semibold text-[#9c2f1d]" role="alert">{error}</p> : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setStage("open")}
                disabled={stage === "deleting"}
                className="flex-1 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-3 py-2 text-sm font-bold"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={stage === "deleting"}
                className="flex-1 rounded-md border-2 border-[#2e2014] bg-[#9c2f1d] px-3 py-2 text-sm font-bold text-[#f4ecdb] disabled:opacity-60"
              >
                {stage === "deleting" ? "Suppression…" : "Oui, supprimer"}
              </button>
            </div>
          </div>
        )}
        <p className="m-0 mt-3 text-xs text-[#8a7558]">
          Tu peux aussi retirer l&apos;accès de Blindz dans Discord : Paramètres, Applications autorisées.
        </p>
      </section>
    </div>
  )
}
