import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { SoloTrack } from "@/lib/types"
import { NICKNAME_KEY } from "@/lib/soloSetup"

const { createChallenge } = vi.hoisted(() => ({ createChallenge: vi.fn() }))
vi.mock("@/lib/apiClient", () => ({ clientApi: { createChallenge } }))

import { ChallengeInvite } from "./ChallengeInvite"

// Bloc defi de la fin de partie. Cas vises : iPhone qui refuse la copie
// (le lien doit rester visible et le bouton ne doit pas mentir), erreur
// reseau puis nouvel essai, menu de partage ferme par le joueur.

const tracks = [1, 2, 3, 4, 5].map(round => ({ round, title: `Titre ${round}`, artist: "Artiste" })) as unknown as SoloTrack[]
const score = { points: 30, correct: 3, rounds: 5, bestStreak: 2 }
const writeText = vi.fn()

function setNavigator(key: "clipboard" | "share", value: unknown) {
  Object.defineProperty(navigator, key, { configurable: true, writable: true, value })
}

function renderInvite(defaultName = "Tym") {
  return render(<ChallengeInvite tracks={tracks} score={score} defaultName={defaultName} featured={false} />)
}

async function createAndWait() {
  fireEvent.click(screen.getByRole("button", { name: /défier un ami/i }))
  return screen.findByLabelText("Lien du défi")
}

beforeEach(() => {
  createChallenge.mockReset()
  writeText.mockReset()
  setNavigator("clipboard", { writeText })
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  setNavigator("share", undefined)
})

describe("ChallengeInvite", () => {
  it("copie refusee (iPhone) : le lien reste affiche et le bouton dit Copier, pas Copie", async () => {
    createChallenge.mockResolvedValue({ code: "K7Q2M9XA" })
    writeText.mockRejectedValue(new Error("NotAllowedError"))
    renderInvite()

    const link = await createAndWait()

    expect(link).toHaveAttribute("readonly")
    expect((link as HTMLInputElement).value).toMatch(/\/challenge\/\?code=K7Q2M9XA$/)
    expect(screen.getByRole("button", { name: "Copier le lien" })).toBeInTheDocument()
    expect(screen.queryByText("Lien copié")).not.toBeInTheDocument()
    expect(screen.getByText("K7Q2M9XA")).toBeInTheDocument()
    expect(createChallenge).toHaveBeenCalledWith(expect.objectContaining({ creatorName: "Tym", score: 30, correct: 3, total: 5, bestStreak: 2 }))
  })

  it("copie acceptee : le bouton confirme", async () => {
    createChallenge.mockResolvedValue({ code: "K7Q2M9XA" })
    writeText.mockResolvedValue(undefined)
    renderInvite()

    await createAndWait()

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/challenge\/\?code=K7Q2M9XA$/))
    expect(screen.getByRole("button", { name: "Lien copié" })).toBeInTheDocument()
  })

  it("clic sur Copier encore refuse : on le dit et on selectionne le lien", async () => {
    createChallenge.mockResolvedValue({ code: "K7Q2M9XA" })
    writeText.mockRejectedValue(new Error("NotAllowedError"))
    renderInvite()
    const link = await createAndWait()

    fireEvent.click(screen.getByRole("button", { name: "Copier le lien" }))

    expect(await screen.findByText(/copie-le à la main/i)).toBeInTheDocument()
    expect(document.activeElement).toBe(link)
    expect(screen.getByRole("button", { name: "Copier le lien" })).toBeInTheDocument()
  })

  it("apres une erreur reseau, un nouvel essai cree bien le defi", async () => {
    createChallenge.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ code: "AB12CD34" })
    writeText.mockResolvedValue(undefined)
    renderInvite()

    fireEvent.click(screen.getByRole("button", { name: /défier un ami/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Le défi n'a pas pu être créé")

    const link = await createAndWait()
    expect((link as HTMLInputElement).value).toMatch(/code=AB12CD34$/)
    expect(createChallenge).toHaveBeenCalledTimes(2)
  })

  describe("pseudo", () => {
    it("retenu apres le succes seulement, quand aucun n'etait connu", async () => {
      createChallenge.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ code: "AB12CD34" })
      writeText.mockResolvedValue(undefined)
      renderInvite("Joueur")
      fireEvent.change(screen.getByLabelText("Ton nom sur le défi"), { target: { value: "Rival" } })

      fireEvent.click(screen.getByRole("button", { name: /défier un ami/i }))
      await screen.findByRole("alert")
      expect(localStorage.getItem(NICKNAME_KEY)).toBeNull()

      await createAndWait()
      expect(localStorage.getItem(NICKNAME_KEY)).toBe("Rival")
    })

    it("un nom tape pour ce defi n'ecrase pas le pseudo connu", async () => {
      localStorage.setItem(NICKNAME_KEY, "Tym")
      createChallenge.mockResolvedValue({ code: "AB12CD34" })
      writeText.mockResolvedValue(undefined)
      renderInvite("Tym")
      fireEvent.change(screen.getByLabelText("Ton nom sur le défi"), { target: { value: "Equipe du jeudi" } })

      await createAndWait()

      expect(createChallenge).toHaveBeenCalledWith(expect.objectContaining({ creatorName: "Equipe du jeudi" }))
      expect(localStorage.getItem(NICKNAME_KEY)).toBe("Tym")
    })
  })

  describe("Envoyer (menu de partage du telephone)", () => {
    beforeEach(() => {
      createChallenge.mockResolvedValue({ code: "K7Q2M9XA" })
      // Copie automatique refusee : on voit si "Envoyer" la retente.
      writeText.mockRejectedValueOnce(new Error("NotAllowedError")).mockResolvedValue(undefined)
    })

    it("menu ferme par le joueur (AbortError) : rien d'autre ne se passe", async () => {
      const share = vi.fn().mockRejectedValue(new DOMException("Share canceled", "AbortError"))
      setNavigator("share", share)
      renderInvite()
      await createAndWait()

      fireEvent.click(await screen.findByRole("button", { name: /envoyer/i }))

      await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1))
      expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringMatching(/code=K7Q2M9XA$/), text: expect.stringContaining("Tym te défie") }))
      expect(writeText).toHaveBeenCalledTimes(1)
      expect(screen.getByRole("button", { name: "Copier le lien" })).toBeInTheDocument()
    })

    it("partage impossible pour une autre raison : le lien est copie a la place", async () => {
      setNavigator("share", vi.fn().mockRejectedValue(new Error("NotAllowedError")))
      renderInvite()
      await createAndWait()

      fireEvent.click(await screen.findByRole("button", { name: /envoyer/i }))

      expect(await screen.findByRole("button", { name: "Lien copié" })).toBeInTheDocument()
      expect(writeText).toHaveBeenCalledTimes(2)
    })
  })
})
