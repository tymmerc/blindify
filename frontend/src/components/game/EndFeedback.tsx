"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react"
import { Check, Loader2 } from "lucide-react"
import {
  buildAnswerPayload,
  buildBugPayload,
  FEEDBACK_MESSAGE_MAX,
  feedbackFailure,
  followUpText,
  sendFeedback,
  sendFollowUp,
  type FeedbackAnswer,
  type FeedbackContext,
  type FeedbackFailure,
} from "@/lib/feedback"
import { claimGameEnd } from "@/lib/feedbackPrompt"
import { StudentNote } from "./StudentNote"
import { DiscordServerLine } from "./DiscordServerLine"

// Petit bloc discret sous les resultats d'une partie : un avis en un geste,
// suivi d'un champ facultatif pour dire pourquoi (T32), et un lien pour
// decrire un bug. Les reponses vont dans la table
// game_feedback, lues par Tym dans l'onglet Retours du tableau de bord.
//
// Une seule fois par appareil, a la fin de la 2e partie, le bloc laisse la
// place au message de Tym (StudentNote, T24) : un champ toujours ouvert.

type SendStatus = "idle" | "sending" | "sent" | FeedbackFailure

const ANSWERS: ReadonlyArray<{ value: FeedbackAnswer; label: string }> = [
  { value: "oui", label: "Oui" },
  { value: "pas_trop", label: "Pas trop" },
]

const THANKS = "Merci, c'est noté."

const FAILURE_TEXT: Record<FeedbackFailure, string> = {
  failed: "Ça n'est pas parti. Réessaie dans un instant.",
  rate_limited: "Beaucoup d'envois d'un coup. Réessaie dans quelques minutes.",
}

const isFailure = (status: SendStatus): status is FeedbackFailure =>
  status === "failed" || status === "rate_limited"

export interface EndFeedbackProps {
  context: FeedbackContext
  className?: string
}

/**
 * Compte cette fin de partie et dit s'il faut montrer le message de Tym.
 * Avant le dessin (layout effect) : pas de Oui / Pas trop qui clignote avant
 * d'etre remplace. La ref evite un 2e appel au rendu suivant ; claimGameEnd
 * evite de compter deux fois un ecran demonte puis remonte pour la meme partie.
 */
function useNotePrompt(context: FeedbackContext): boolean {
  const counted = useRef(false)
  const [show, setShow] = useState(false)
  useLayoutEffect(() => {
    if (counted.current) return
    counted.current = true
    if (claimGameEnd(context)) setShow(true)
    // Une seule decision par ecran : le contexte du premier rendu suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return show
}

export function EndFeedback({ context, className = "" }: EndFeedbackProps) {
  const titleId = useId()
  const showNote = useNotePrompt(context)
  return (
    <section
      aria-labelledby={showNote ? undefined : titleId}
      aria-label={showNote ? "Un mot pour l'étudiant derrière Blindz" : undefined}
      data-testid="end-feedback"
      className={`mx-auto w-full max-w-sm border-t-2 border-dotted border-[rgb(var(--c-line)/.35)] pt-4 text-left text-ink ${className}`}
    >
      {showNote ? (
        <StudentNote context={context} />
      ) : (
        <>
          <QuickAnswer context={context} titleId={titleId} />
          <BugReport context={context} />
        </>
      )}
      <DiscordServerLine className="mt-3" />
    </section>
  )
}

// Apres Oui ou Pas trop, un champ s'ouvre tout de suite (T32, demande de Tym
// du 07/11) : l'avis est deja parti, le texte vient s'y ajouter s'il y en a un.
const FOLLOW_UP: Record<FeedbackAnswer, { label: string; placeholder: string }> = {
  oui: { label: "Qu'est-ce qui t'a plu ?", placeholder: "Par exemple : jouer sur nos playlists" },
  pas_trop: { label: "Qu'est-ce qui a coincé ?", placeholder: "Par exemple : les extraits trop courts" },
}

const FOLLOW_UP_DONE = "Merci, c'est bien arrivé."

function QuickAnswer({ context, titleId }: { context: FeedbackContext; titleId: string }) {
  const [chosen, setChosen] = useState<FeedbackAnswer | null>(null)
  const [status, setStatus] = useState<SendStatus>("idle")
  // Pas de jeton rendu (backend plus ancien) : on ne propose pas le champ.
  const [canWrite, setCanWrite] = useState(true)
  // Leve des le premier clic, avant que React ait redessine les boutons :
  // deux clics tres rapproches n'envoient qu'un avis. Reste leve apres un
  // envoi reussi (un seul avis par ecran), retombe apres un echec.
  const guard = useRef(false)
  // L'envoi de l'avis en cours : le texte l'attend s'il est tape tres vite.
  const pending = useRef<Promise<string | null> | null>(null)
  const locked = status === "sending" || status === "sent"

  const answer = async (value: FeedbackAnswer) => {
    if (guard.current) return
    guard.current = true
    setChosen(value)
    setStatus("sending")
    const sending = sendFeedback(buildAnswerPayload(context, value))
    pending.current = sending
    try {
      const token = await sending
      setCanWrite(token !== null)
      setStatus("sent")
    } catch (err) {
      guard.current = false
      pending.current = null
      setStatus(feedbackFailure(err))
    }
  }

  // Le champ s'ouvre au clic, sans attendre la reponse du serveur : le focus
  // reste dans le geste du joueur (clavier ouvert sur telephone).
  const showForm = chosen !== null && locked && canWrite

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p id={titleId} className="font-display text-base font-semibold italic">
          Ça s&apos;est bien passé ?
        </p>
        <div role="group" aria-labelledby={titleId} className="flex gap-2">
          {ANSWERS.map(({ value, label }) => (
            <AnswerButton
              key={value}
              label={label}
              pressed={chosen === value && !isFailure(status)}
              sending={chosen === value && status === "sending"}
              disabled={locked}
              onClick={() => void answer(value)}
            />
          ))}
        </div>
      </div>
      <p aria-live="polite" className="mt-1 min-h-[1.25rem] text-xs text-ink-2">
        {status === "sent" ? THANKS : null}
        {isFailure(status) ? <span className="font-semibold text-rouge-txt">{FAILURE_TEXT[status]}</span> : null}
      </p>
      {showForm && chosen ? <FollowUpForm answer={chosen} pending={pending} /> : null}
    </div>
  )
}

function FollowUpForm({ answer, pending }: { answer: FeedbackAnswer; pending: { current: Promise<string | null> | null } }) {
  const fieldId = useId()
  const hintId = useId()
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const doneRef = useRef<HTMLParagraphElement>(null)
  const [text, setText] = useState("")
  const [status, setStatus] = useState<SendStatus>("idle")
  // Un double Envoyer ne fait qu'un envoi.
  const guard = useRef(false)
  const { label, placeholder } = FOLLOW_UP[answer]

  useEffect(() => {
    // preventScroll : dans l'iframe Discord, le defilement automatique fait
    // sauter tout l'ecran de resultats.
    fieldRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (status === "sent") doneRef.current?.focus()
  }, [status])

  const message = followUpText(text)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (guard.current || !message) return
    guard.current = true
    setStatus("sending")
    try {
      const token = await pending.current
      if (!token) throw new Error("avis sans jeton")
      await sendFollowUp(token, message)
      setStatus("sent")
    } catch (err) {
      guard.current = false
      setStatus(feedbackFailure(err))
    }
  }

  if (status === "sent") {
    return (
      <p ref={doneRef} tabIndex={-1} className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink outline-none">
        <Check aria-hidden className="h-4 w-4 text-sage-txt animate-in zoom-in-50 spin-in-12 duration-300" />
        {FOLLOW_UP_DONE}
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="mb-2 space-y-2 animate-in slide-in-from-top-1 duration-200">
      <label htmlFor={fieldId} className="block text-sm font-semibold">
        {label}
      </label>
      <textarea
        ref={fieldRef}
        id={fieldId}
        value={text}
        onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          // Ctrl+Entree ou Cmd+Entree envoie, Entree seule va a la ligne.
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }
        }}
        maxLength={FEEDBACK_MESSAGE_MAX}
        rows={2}
        aria-describedby={hintId}
        placeholder={placeholder}
        className="w-full resize-none rounded-md border-[1.5px] border-[rgb(var(--c-line)/.35)] bg-well px-3 py-2 text-base text-ink outline-none placeholder:italic placeholder:text-sourd focus:border-terra sm:text-sm"
      />
      <p id={hintId} className="flex justify-between gap-3 text-[11px] text-ink-2">
        <span>Facultatif. Ton avis est déjà compté, ce mot s&apos;y ajoute, sans ton pseudo.</span>
        <span className="shrink-0 tabular-nums">{text.length}/{FEEDBACK_MESSAGE_MAX}</span>
      </p>
      {isFailure(status) ? <p role="alert" className="text-xs font-semibold text-rouge-txt">{FAILURE_TEXT[status]}</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={status === "sending" || !message}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border-[1.5px] border-line bg-terra px-4 text-sm font-bold text-on-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgb(var(--c-shadow))] disabled:opacity-50"
        >
          {status === "sending" ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : null}
          Envoyer
        </button>
      </div>
    </form>
  )
}

interface AnswerButtonProps {
  label: string
  pressed: boolean
  sending: boolean
  disabled: boolean
  onClick: () => void
}

function AnswerButton({ label, pressed, sending, disabled, onClick }: AnswerButtonProps) {
  // Confirmation = le bouton vire sauge et un check apparait ; pression = il
  // s'enfonce dans son ombre (langage commun de maquettes/qol-demo.html).
  // Fond sauge clair et texte encre : le creme sur sauge plein ne se lit pas
  // assez (contraste sous 3:1).
  const tone = pressed
    ? "translate-x-[2px] translate-y-[2px] border-sage bg-sage/30 text-ink shadow-none"
    : "border-line bg-transparent text-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgb(var(--c-shadow))]"
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-md border-[1.5px] px-3.5 text-sm font-bold transition disabled:cursor-default ${tone} ${
        disabled && !pressed ? "opacity-40" : ""
      }`}
    >
      {sending ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : null}
      {pressed && !sending ? <Check aria-hidden className="h-3.5 w-3.5 animate-in zoom-in-50 spin-in-12 duration-300" /> : null}
      {label}
    </button>
  )
}

function BugReport({ context }: { context: FeedbackContext }) {
  const formId = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [status, setStatus] = useState<SendStatus>("idle")
  // Meme garde que pour l'avis : un double Envoyer ne fait qu'un signalement.
  const guard = useRef(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const doneRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (status === "sent") doneRef.current?.focus()
  }, [status])

  const close = () => {
    setOpen(false)
    setStatus("idle")
    toggleRef.current?.focus()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (guard.current) return
    guard.current = true
    setStatus("sending")
    try {
      await sendFeedback(buildBugPayload(context, text))
      setStatus("sent")
    } catch (err) {
      guard.current = false
      setStatus(feedbackFailure(err))
    }
  }

  if (status === "sent") {
    return (
      <p ref={doneRef} tabIndex={-1} className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink outline-none">
        <Check aria-hidden className="h-4 w-4 text-sage-txt animate-in zoom-in-50 spin-in-12 duration-300" />
        Merci, on regarde ça.
      </p>
    )
  }

  // Bouton de divulgation toujours monte : il porte aria-expanded et reprend le
  // focus quand on referme le formulaire (Echap ou Annuler).
  return (
    <div>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => (open ? close() : setOpen(true))}
        className="mt-1 text-xs font-semibold text-ink-2 underline decoration-dotted underline-offset-4 hover:text-terra-txt"
      >
        Signaler un bug
      </button>
      {open ? (
        <BugForm id={formId} text={text} onText={setText} status={status} onSubmit={submit} onCancel={close} />
      ) : null}
    </div>
  )
}

interface BugFormProps {
  id: string
  text: string
  onText: (value: string) => void
  status: SendStatus
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}

function BugForm({ id, text, onText, status, onSubmit, onCancel }: BugFormProps) {
  const fieldId = useId()
  const hintId = useId()
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fieldRef.current?.focus()
  }, [])

  return (
    <form
      id={id}
      onSubmit={onSubmit}
      onKeyDown={event => {
        if (event.key === "Escape") onCancel()
      }}
      className="mt-2 space-y-2 animate-in slide-in-from-top-1 duration-200"
    >
      <label htmlFor={fieldId} className="block text-sm font-semibold">
        Qu&apos;est-ce qui s&apos;est passé ?
      </label>
      <textarea
        ref={fieldRef}
        id={fieldId}
        value={text}
        onChange={event => onText(event.target.value)}
        maxLength={FEEDBACK_MESSAGE_MAX}
        rows={3}
        aria-describedby={hintId}
        placeholder="Par exemple : le son s'est coupé à la 3e manche"
        className="w-full resize-none rounded-md border-[1.5px] border-[rgb(var(--c-line)/.35)] bg-well px-3 py-2 text-sm text-ink outline-none placeholder:italic placeholder:text-sourd focus:border-terra"
      />
      <p id={hintId} className="flex justify-between gap-3 text-[11px] text-ink-2">
        <span>Facultatif. On l&apos;enregistre avec le mode de jeu et ton type de navigateur, sans ton pseudo.</span>
        <span className="shrink-0 tabular-nums">{text.length}/{FEEDBACK_MESSAGE_MAX}</span>
      </p>
      {isFailure(status) ? <p role="alert" className="text-xs font-semibold text-rouge-txt">{FAILURE_TEXT[status]}</p> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[40px] rounded-md border-[1.5px] border-line px-3.5 text-sm font-bold text-ink transition hover:bg-ink-block hover:text-on-ink"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border-[1.5px] border-line bg-terra px-4 text-sm font-bold text-on-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_rgb(var(--c-shadow))] disabled:opacity-50"
        >
          {status === "sending" ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : null}
          Envoyer
        </button>
      </div>
    </form>
  )
}
