import "@testing-library/jest-dom/vitest"

import { beforeEach } from "vitest"
import { PROMPT_SHOWN_KEY } from "@/lib/feedbackPrompt"

// Le message de Tym ne sort qu'une fois par appareil, en fin de 2e partie
// (T24). Les tests qui affichent plusieurs fins de partie verraient sinon le
// bloc changer d'un test a l'autre : on le marque comme deja montre, et les
// tests du message (feedbackPrompt, EndFeedback) retirent cette marque.
beforeEach(() => {
  try {
    window.localStorage.setItem(PROMPT_SHOWN_KEY, "tests")
  } catch {
    // Environnement sans DOM (tests node) : rien a faire.
  }
})
