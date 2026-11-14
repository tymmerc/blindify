"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import { ApiError } from "@/lib/apiClient"
import type { UserSummary } from "@/lib/types"
import { NICKNAME_KEY, writeStored } from "@/lib/soloSetup"
import { InAppBrowserNote } from "./InAppBrowserNote"

const PASSWORD_MIN = 8

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.code === "username_taken") {
    return "Ce pseudo est déjà pris par un compte. Ajoute une lettre ou un chiffre."
  }
  if (err instanceof ApiError && err.status === 429) {
    return "Trop d'essais d'un coup. Réessaie dans une minute."
  }
  return "Ça n'a pas marché. Réessaie dans un instant."
}

// T26 : un invite transforme sa session en compte, sans rien perdre (le
// serveur garde le meme joueur). Seul moyen de retrouver ses parties depuis
// Snapchat, la navigation privee ou un autre telephone.
export function KeepMyInfo({ pseudo, onKept }: { pseudo: string; onKept: (user: UserSummary) => void }) {
  const [username, setUsername] = useState(pseudo)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const name = username.trim()
    if (name.length < 2) {
      setError("Ton pseudo doit faire au moins 2 caractères.")
      return
    }
    if (password.length < PASSWORD_MIN) {
      setError(`Le mot de passe doit faire au moins ${PASSWORD_MIN} caractères.`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { user } = await api.register(name, password)
      writeStored(NICKNAME_KEY, user.username ?? name)
      onKept(user)
    } catch (err) {
      setError(errorText(err))
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="text-sm text-ink-2">
        Tu joues sans compte : ce navigateur se souvient de toi, mais ailleurs (Snapchat, un autre navigateur, un autre
        téléphone) tu repars de zéro. Choisis un mot de passe et tu retrouves tes parties et ta musique partout.
      </p>
      <InAppBrowserNote className="mt-2" />
      <form onSubmit={submit} noValidate className="mt-4 space-y-2">
        <label htmlFor="keep-username" className="sr-only">
          Pseudo pour te connecter
        </label>
        <input
          id="keep-username"
          value={username}
          onChange={e => {
            setUsername(e.target.value)
            setError(null)
          }}
          maxLength={40}
          autoComplete="username"
          placeholder="Pseudo pour te connecter"
          className="w-full rounded-md border-[1.5px] border-line bg-paper-light px-3 py-2 text-base text-ink outline-none focus:shadow-[2px_2px_0_rgb(var(--c-shadow))]"
        />
        <label htmlFor="keep-password" className="sr-only">
          Mot de passe
        </label>
        <input
          id="keep-password"
          type="password"
          value={password}
          onChange={e => {
            setPassword(e.target.value)
            setError(null)
          }}
          autoComplete="new-password"
          placeholder={`Mot de passe (${PASSWORD_MIN} caractères ou plus)`}
          className="w-full rounded-md border-[1.5px] border-line bg-paper-light px-3 py-2 text-base text-ink outline-none focus:shadow-[2px_2px_0_rgb(var(--c-shadow))]"
        />
        {error && (
          <p role="alert" className="text-[12px] font-bold text-rouge-txt">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md border-[1.5px] border-line bg-ink-block px-4 py-2 text-sm font-semibold text-[#fbf6ea] disabled:opacity-50"
          >
            {saving ? "Un instant…" : "Garder mes infos"}
          </button>
          <Link
            href="/auth/login/?returnTo=/profile/"
            className="text-sm font-semibold text-ink underline underline-offset-4"
          >
            J&apos;ai déjà un compte
          </Link>
        </div>
      </form>
    </div>
  )
}
