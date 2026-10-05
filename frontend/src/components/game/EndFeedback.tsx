"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { Check, Loader2 } from "lucide-react"
import { clientApi } from "@/lib/apiClient"
import {
  buildAnswerPayload,
  buildBugPayload,
  FEEDBACK_MESSAGE_MAX,
  type FeedbackAnswer,
  type FeedbackContext,
} from "@/lib/feedback"

// Petit bloc discret sous les resultats d'une partie : un avis en un geste,
// et un lien pour decrire un bug. Les reponses vont dans la table
// game_feedback, lues par Tym dans l'onglet Retours du tableau de bord.

type SendStatus = "idle" | "sending" | "sent" | "error"

const ANSWERS: ReadonlyArray<{ value: FeedbackAnswer; label: string }> = [
  { value: "oui", label: "Oui" },
  { value: "pas_trop", label: "Pas trop" },
]

const THANKS: Record<FeedbackAnswer, string> = {
  oui: "Merci, c'est noté.",
  pas_trop: "Merci de le dire. Si un truc a coincé, raconte-nous juste en dessous.",
}

const SEND_FAILED = "Ça n'est pas parti. Réessaie dans un instant."

export interface EndFeedbackProps {
  context: FeedbackContext
  className?: string
}

export function EndFeedback({ context, className = "" }: EndFeedbackProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      data-testid="end-feedback"
      className={`mx-auto w-full max-w-sm border-t-2 border-dotted border-[rgba(46,32,20,.35)] pt-4 text-left text-[#2e2014] ${className}`}
    >
      <QuickAnswer context={context} titleId={titleId} />
      <BugReport context={context} />
    </section>
  )
}

function QuickAnswer({ context, titleId }: { context: FeedbackContext; titleId: string }) {
  const [chosen, setChosen] = useState<FeedbackAnswer | null>(null)
  const [status, setStatus] = useState<SendStatus>("idle")
  const locked = status === "sending" || status === "sent"

  const answer = async (value: FeedbackAnswer) => {
    if (locked) return
    setChosen(value)
    setStatus("sending")
    try {
      await clientApi.sendFeedback(buildAnswerPayload(context, value))
      setStatus("sent")
    } catch {
      setStatus("error")
    }
  }

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
              pressed={chosen === value && status !== "error"}
              sending={chosen === value && status === "sending"}
              disabled={locked}
              onClick={() => void answer(value)}
            />
          ))}
        </div>
      </div>
      <p aria-live="polite" className="mt-1 min-h-[1.25rem] text-xs text-[#6b573f]">
        {status === "sent" && chosen ? THANKS[chosen] : null}
        {status === "error" ? <span className="font-semibold text-[#9c2f1d]">{SEND_FAILED}</span> : null}
      </p>
    </div>
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
    ? "translate-x-[2px] translate-y-[2px] border-[#7d9471] bg-[#7d9471]/30 text-[#2e2014] shadow-none"
    : "border-[#2e2014] bg-transparent text-[#2e2014] shadow-[2px_2px_0_#2e2014] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#2e2014]"
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
    if (status === "sending") return
    setStatus("sending")
    try {
      await clientApi.sendFeedback(buildBugPayload(context, text))
      setStatus("sent")
    } catch {
      setStatus("error")
    }
  }

  if (status === "sent") {
    return (
      <p ref={doneRef} tabIndex={-1} className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#2e2014] outline-none">
        <Check aria-hidden className="h-4 w-4 text-[#7d9471] animate-in zoom-in-50 spin-in-12 duration-300" />
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
        className="mt-1 text-xs font-semibold text-[#6b573f] underline decoration-dotted underline-offset-4 hover:text-[#c65133]"
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
        className="w-full resize-none rounded-md border-[1.5px] border-[rgba(46,32,20,.35)] bg-[#efe5d0] px-3 py-2 text-sm text-[#2e2014] outline-none placeholder:italic placeholder:text-[#8a7558] focus:border-[#c65133]"
      />
      <p id={hintId} className="flex justify-between gap-3 text-[11px] text-[#6b573f]">
        <span>Facultatif. On l&apos;enregistre avec le mode de jeu et ton type de navigateur, sans ton pseudo.</span>
        <span className="shrink-0 tabular-nums">{text.length}/{FEEDBACK_MESSAGE_MAX}</span>
      </p>
      {status === "error" ? <p role="alert" className="text-xs font-semibold text-[#9c2f1d]">{SEND_FAILED}</p> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[40px] rounded-md border-[1.5px] border-[#2e2014] px-3.5 text-sm font-bold text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border-[1.5px] border-[#2e2014] bg-[#c65133] px-4 text-sm font-bold text-[#f4ecdb] shadow-[2px_2px_0_#2e2014] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_#2e2014] disabled:opacity-50"
        >
          {status === "sending" ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : null}
          Envoyer
        </button>
      </div>
    </form>
  )
}
