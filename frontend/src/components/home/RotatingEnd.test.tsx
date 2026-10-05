import { act, render } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RotatingEnd, enLettres, etatFin } from "./RotatingEnd"

const FINS = [
  <span key="a">avec <em className="rouge">vos</em> playlists.</span>,
  <span key="b">de vos <em className="rouge">soirées</em>.</span>,
  <span key="c"><em className="rouge">100 % gratuit</em>.</span>,
]

function moinsDAnimations(actif: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: actif }) as unknown as typeof window.matchMedia
}

describe("etatFin", () => {
  it("au chargement, la premiere fin est au repos et les autres attendent", () => {
    expect([0, 1, 2].map(i => etatFin(i, 0, 3))).toEqual(["repos", "attend", "attend"])
  })

  it("apres un passage, la nouvelle entre et l'ancienne sort", () => {
    expect([0, 1, 2].map(i => etatFin(i, 1, 3))).toEqual(["sort", "entre", "attend"])
    expect([0, 1, 2].map(i => etatFin(i, 2, 3))).toEqual(["attend", "sort", "entre"])
  })

  it("boucle : apres la derniere, la premiere revient en entrant (pas au repos)", () => {
    expect([0, 1, 2].map(i => etatFin(i, 3, 3))).toEqual(["entre", "attend", "sort"])
    expect([0, 1, 2].map(i => etatFin(i, 30, 3))).toEqual(["entre", "attend", "sort"])
  })

  it("avec deux fins, l'une entre pendant que l'autre sort", () => {
    expect([0, 1].map(i => etatFin(i, 1, 2))).toEqual(["sort", "entre"])
    expect([0, 1].map(i => etatFin(i, 2, 2))).toEqual(["entre", "sort"])
  })
})

describe("enLettres", () => {
  it("garde le texte, les <em> et leurs classes, une lettre par span", () => {
    const { container } = render(<p>{enLettres(FINS[0])}</p>)
    expect(container.textContent).toBe("avec vos playlists.")
    const em = container.querySelector("em.rouge")
    expect(em?.textContent).toBe("vos")
    expect(em?.querySelectorAll(".volet")).toHaveLength(3)
    // 17 lettres, les 2 espaces restent du texte simple
    const lettres = [...container.querySelectorAll(".volet")]
    expect(lettres).toHaveLength(17)
    expect(lettres.every(l => l.textContent?.length === 1 && l.textContent !== " ")).toBe(true)
  })

  it("numerote les lettres dans l'ordre de lecture, espaces compris", () => {
    const { container } = render(<p>{enLettres(FINS[0])}</p>)
    const rangs = [...container.querySelectorAll<HTMLElement>(".volet")].map(l => l.style.getPropertyValue("--i"))
    // a v e c _ v o s _ p l a y l i s t s .
    expect(rangs.slice(0, 8)).toEqual(["0", "1", "2", "3", "5", "6", "7", "9"])
    expect(rangs.at(-1)).toBe("18")
  })

  it("garde les lettres accentuees entieres", () => {
    const { container } = render(<p>{enLettres(FINS[1])}</p>)
    expect([...container.querySelectorAll(".volet")].map(l => l.textContent).join("")).toBe("devossoirées.")
  })
})

describe("RotatingEnd", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("le HTML pre-rendu ne contient que la premiere fin, d'un seul tenant", () => {
    const html = renderToString(<RotatingEnd endings={FINS} />)
    expect(html).toContain("playlists.")
    expect(html).not.toContain("soirées")
    expect(html).not.toContain("gratuit")
    expect(html).not.toContain("volet")
  })

  it("reste fixe sur la premiere fin si l'appareil demande moins d'animations", () => {
    vi.useFakeTimers()
    moinsDAnimations(true)
    const { container } = render(<RotatingEnd endings={FINS} />)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(container.textContent).toBe("avec vos playlists.")
    expect(container.querySelector("[data-etat]")).toBeNull()
  })

  it("passe d'une fin a l'autre toutes les 2,2 s, une seule lisible a la fois", () => {
    vi.useFakeTimers()
    moinsDAnimations(false)
    const { container } = render(<RotatingEnd endings={FINS} />)
    const etats = () => [...container.querySelectorAll("[data-etat]")].map(e => e.getAttribute("data-etat"))
    const lisibles = () => [...container.querySelectorAll("[data-etat]")].filter(e => e.getAttribute("aria-hidden") !== "true")

    expect(etats()).toEqual(["repos", "attend", "attend"])
    expect(lisibles()).toHaveLength(1)
    // la premiere fin reste d'un seul tenant tant que rien n'a bouge
    expect(container.querySelector(".volet")).toBeNull()

    act(() => {
      vi.advanceTimersByTime(2199)
    })
    expect(etats()).toEqual(["repos", "attend", "attend"])

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(etats()).toEqual(["sort", "entre", "attend"])
    expect(lisibles()).toHaveLength(1)
    const entre = lisibles()[0]
    expect(entre.getAttribute("data-etat")).toBe("entre")
    // en lettres pour l'animation, mais lue d'un bloc par le lecteur d'ecran
    expect(entre.querySelector("[aria-hidden='true'] .volet")).not.toBeNull()
    expect(entre.querySelector(".sr-only")?.textContent).toBe("de vos soirées.")

    act(() => {
      vi.advanceTimersByTime(2200 * 2)
    })
    expect(etats()).toEqual(["entre", "attend", "sort"])
    expect(lisibles()).toHaveLength(1)
    // les fins qui attendent ne gardent pas leurs lettres
    expect(container.querySelector("[data-etat='attend'] .volet")).toBeNull()
  })

  it("une seule fin : rien ne tourne", () => {
    vi.useFakeTimers()
    moinsDAnimations(false)
    const { container } = render(<RotatingEnd endings={[FINS[0]]} />)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(container.textContent).toBe("avec vos playlists.")
    expect(container.querySelector("[data-etat]")).toBeNull()
  })
})
