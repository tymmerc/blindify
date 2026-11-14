"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { Check, Loader2 } from "lucide-react"
import {
  buildNotePayload,
  FEEDBACK_CONTACT_MAX,
  FEEDBACK_MESSAGE_MAX,
  feedbackFailure,
  sendFeedback,
  type FeedbackFailure,
  type NoteContext,
} from "@/lib/feedback"

// Le message de Tym aux joueurs (T24), mot pour mot comme il l'a valide le
// 01/11. Affiche une fois par appareil en fin de 2e partie (EndFeedback) et
// sur la page /avis/ (lien « Donne ton avis » du pied de page). Les messages
// arrivent dans game_feedback (type « mot ») et Tym recoit un mail.

export const NOTE_INTRO =
  "Hello, je suis l'étudiant derrière Blindz. Un truc qui t'a plu, un truc qui t'a saoulé ? Écris-le ici, je lis tout."
export const NOTE_CONTACT_LABEL = "Ton Insta ou ton e-mail si tu veux que je te réponde (facultatif)"
export const NOTE_CONTACT_HINT = "Je le garde 12 mois, juste pour pouvoir te répondre."
export const NOTE_THANKS = "Merci, c'est bien arrivé. Je lis ça très vite."
export const NOTE_THANKS_CONTACT = "Merci, c'est bien arrivé. Je te réponds dès que je l'ai lu."

type SendStatus = "idle" | "sending" | "sent" | FeedbackFailure

const FAILURE_TEXT: Record<FeedbackFailure, string> = {
  failed: "Ça n'est pas parti. Réessaie dans un instant.",
  rate_limited: "Beaucoup d'envois d'un coup. Réessaie dans quelques minutes.",
}

const isFailure = (status: SendStatus): status is FeedbackFailure =>
  status === "failed" || status === "rate_limited"

const FIELD =
  "w-full rounded-md border-[1.5px] border-[rgb(var(--c-line)/.35)] bg-well px-3 py-2 text-sm text-ink outline-none placeholder:italic placeholder:text-sourd focus:border-terra"

export interface StudentNoteProps {
  context: NoteContext
  className?: string
}

export function StudentNote({ context, className = "" }: StudentNoteProps) {
  const introId = useId()
  const messageId = useId()
  const contactId = useId()
  const hintId = useId()
  const [message, setMessage] = useState("")
  const [contact, setContact] = useState("")
  const [status, setStatus] = useState<SendStatus>("idle")
  const [withContact, setWithContact] = useState(false)
  // Un double Envoyer ne fait qu'un message (meme garde que EndFeedback).
  const guard = useRef(false)
  const doneRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (status === "sent") doneRef.current?.focus()
  }, [status])

  const empty = message.trim() === ""

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const payload = buildNotePayload(context, message, contact)
    if (!payload || guard.current) return
    guard.current = true
    setStatus("sending")
    try {
      await sendFeedback(payload)
      setWithContact(Boolean(payload.contact))
      setStatus("sent")
    } catch (err) {
      guard.current = false
      setStatus(feedbackFailure(err))
    }
  }

  if (status === "sent") {
    return (
      <p
        ref={doneRef}
        tabIndex={-1}
        data-testid="student-note-thanks"
        className={`flex items-start gap-1.5 text-sm font-semibold text-ink outline-none ${className}`}
      >
        <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-sage-txt animate-in zoom-in-50 spin-in-12 duration-300" />
        {withContact ? NOTE_THANKS_CONTACT : NOTE_THANKS}
      </p>
    )
  }

  return (
    <form onSubmit={submit} aria-labelledby={introId} data-testid="student-note" className={`space-y-3 text-left text-ink ${className}`}>
      <p id={introId} className="font-display text-base font-semibold italic leading-snug">
        {NOTE_INTRO}
      </p>
      <div>
        <label htmlFor={messageId} className="sr-only">
          Ton message
        </label>
        <textarea
          id={messageId}
          value={message}
          onChange={event => setMessage(event.target.value)}
          maxLength={FEEDBACK_MESSAGE_MAX}
          rows={3}
          className={`${FIELD} resize-none`}
        />
        <p className="text-right text-[11px] tabular-nums text-ink-2">
          {message.length}/{FEEDBACK_MESSAGE_MAX}
        </p>
      </div>
      <div>
        <label htmlFor={contactId} className="block text-xs font-semibold text-ink-2">
          {NOTE_CONTACT_LABEL}
        </label>
        <input
          id={contactId}
          type="text"
          value={contact}
          onChange={event => setContact(event.target.value)}
          maxLength={FEEDBACK_CONTACT_MAX}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby={hintId}
          className={`${FIELD} mt-1`}
        />
        <p id={hintId} className="mt-1 text-[11px] text-ink-2">
          {NOTE_CONTACT_HINT}
        </p>
      </div>
      {isFailure(status) ? (
        <p role="alert" className="text-xs font-semibold text-rouge-txt">
          {FAILURE_TEXT[status]}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={empty || status === "sending"}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border-[1.5px] border-line bg-terra px-4 text-sm font-bold text-on-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgb(var(--c-shadow))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "sending" ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : null}
          Envoyer
        </button>
      </div>
    </form>
  )
}
