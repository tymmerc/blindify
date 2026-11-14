"use client"

import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import { ApiError } from "@/lib/apiClient"
import { avatarSrc, photoPickMessage, shrinkPhoto } from "@/lib/photo"

const SEND_FAILED = "Ta photo n'est pas passée. Réessaie dans un instant."

export interface ProfilePhoto {
  /** Ce qu'affiche le rond : l'apercu local d'abord, sinon la photo en ligne. */
  src: string | null
  busy: boolean
  error: string | null
  /** Une photo choisie mais pas encore envoyee (joueur pas encore enregistre). */
  hasPending: boolean
  /** La photo deja en ligne, quand on la connait (users.avatar). */
  setOnline: (avatar: string | null) => void
  /** Reduit la photo ; l'envoie tout de suite si `send`, sinon la garde pour plus tard. */
  pick: (file: File, send: boolean) => Promise<void>
  /** Envoie la photo en attente. Rend false si l'envoi a echoue (message dans error). */
  sendPending: () => Promise<boolean>
  remove: () => Promise<void>
}

function sendError(err: unknown): string {
  // Le serveur explique deja (pas une photo, trop grande, trop d'envois).
  return err instanceof ApiError && err.code ? err.message : SEND_FAILED
}

/** L'etat du rond photo (T39), partage par l'ecran du debut et « Mon compte ». */
export function useProfilePhoto(): ProfilePhoto {
  const [online, setOnline] = useState<string | null>(null)
  const [pending, setPending] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  // keepOnFail : l'ecran du debut garde la photo pour un nouvel essai au
  // prochain « Continuer ». Ailleurs (Mon compte), un echec remet la photo en
  // ligne : le rond ne montre jamais une photo qui n'est pas enregistree.
  const upload = useCallback(async (image: Blob, keepOnFail: boolean): Promise<boolean> => {
    try {
      const { avatar } = await api.uploadPhoto(image)
      setOnline(avatar)
      setPending(null)
      // La version du serveur (carre, 256 px) : celle que voient les autres.
      setPreview(null)
      return true
    } catch (err) {
      if (keepOnFail) setPending(image)
      else {
        setPending(null)
        setPreview(null)
      }
      setError(sendError(err))
      return false
    }
  }, [])

  const pick = useCallback(
    async (file: File, send: boolean) => {
      setError(null)
      setBusy(true)
      try {
        const image = await shrinkPhoto(file)
        setPreview(URL.createObjectURL(image))
        if (send) await upload(image, false)
        else setPending(image)
      } catch (err) {
        setError(photoPickMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [upload]
  )

  const sendPending = useCallback(async (): Promise<boolean> => {
    if (!pending) return true
    setError(null)
    setBusy(true)
    try {
      return await upload(pending, true)
    } finally {
      setBusy(false)
    }
  }, [pending, upload])

  const remove = useCallback(async () => {
    setError(null)
    if (online) {
      setBusy(true)
      try {
        await api.deletePhoto()
      } catch {
        setError("La photo n'a pas pu être retirée. Réessaie dans un instant.")
        setBusy(false)
        return
      }
      setBusy(false)
    }
    setOnline(null)
    setPending(null)
    setPreview(null)
  }, [online])

  return {
    src: preview ?? avatarSrc(online),
    busy,
    error,
    hasPending: pending !== null,
    setOnline,
    pick,
    sendPending,
    remove,
  }
}
