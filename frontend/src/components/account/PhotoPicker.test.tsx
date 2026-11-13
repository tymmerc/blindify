import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PhotoPicker } from "./PhotoPicker"

describe("PhotoPicker", () => {
  it("rond vide : propose d'ajouter une photo, galerie ou appareil (pas de capture forcee)", () => {
    const { getByTestId, getAllByText } = render(<PhotoPicker src={null} onPick={vi.fn()} onRemove={vi.fn()} />)
    const input = getByTestId("photo-input")
    expect(input).toHaveAttribute("accept", "image/*")
    expect(input).not.toHaveAttribute("capture")
    expect(getAllByText("Ajouter une photo").length).toBeGreaterThan(0)
  })

  it("rend le fichier choisi au parent", () => {
    const onPick = vi.fn()
    const { getByTestId } = render(<PhotoPicker src={null} onPick={onPick} onRemove={vi.fn()} />)
    const file = new File(["x"], "moi.jpg", { type: "image/jpeg" })
    fireEvent.change(getByTestId("photo-input"), { target: { files: [file] } })
    expect(onPick).toHaveBeenCalledWith(file)
  })

  it("avec une photo : Changer et Retirer, et le message d'erreur s'affiche", () => {
    const onRemove = vi.fn()
    const { getByText, getByRole } = render(
      <PhotoPicker src="blob:apercu" error="Ta photo n'est pas passée." onPick={vi.fn()} onRemove={onRemove} />
    )
    expect(getByText("Changer")).toBeInTheDocument()
    fireEvent.click(getByText("Retirer"))
    expect(onRemove).toHaveBeenCalled()
    expect(getByRole("alert")).toHaveTextContent("Ta photo n'est pas passée.")
  })
})
