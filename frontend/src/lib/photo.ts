import { apiUrl } from "./config"

/**
 * Photo de profil (T39).
 *
 * users.avatar vaut soit l'adresse d'une photo mise sur Blindz, relative a
 * l'API (/api/photos/<id>.webp), soit l'avatar Discord (https). Le reste n'est
 * jamais affiche : une valeur inattendue retombe sur l'initiale.
 */
export const PHOTO_PATH_PREFIX = "/api/photos/"

export function avatarSrc(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw.startsWith(PHOTO_PATH_PREFIX)) return apiUrl(raw)
  if (/^https:\/\//i.test(raw)) return raw
  return null
}

/** La premiere lettre du pseudo (un emoji compte pour une lettre), sinon « ? ». */
export function avatarInitial(name: string | null | undefined): string {
  const first = Array.from((name ?? "").trim())[0]
  return first ? first.toUpperCase() : "?"
}

// Une photo de telephone pese 3 a 12 Mo : on l'envoie deja recadree et
// reduite. Le serveur refait tout (format, carre, 256 px, metadonnees), ce
// n'est qu'un gain de temps et de donnees mobiles.
const SHRINK_SIZE_PX = 512

export class PhotoPickError extends Error {
  constructor(readonly kind: "not_an_image" | "unreadable") {
    super(kind)
    this.name = "PhotoPickError"
  }
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new PhotoPickError("unreadable"))
    }
    img.src = url
  })
}

/**
 * Recadre au centre en carre et reduit a 512 px, en JPEG. Le navigateur
 * applique l'orientation de la photo en la dessinant. Lance PhotoPickError.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new PhotoPickError("not_an_image")
  const img = await loadImage(file)
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  if (!side) throw new PhotoPickError("unreadable")
  const out = Math.min(side, SHRINK_SIZE_PX)
  const canvas = document.createElement("canvas")
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new PhotoPickError("unreadable")
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.88))
  if (!blob) throw new PhotoPickError("unreadable")
  return blob
}

export function photoPickMessage(err: unknown): string {
  if (err instanceof PhotoPickError) {
    return err.kind === "not_an_image"
      ? "Ce fichier n'est pas une photo."
      : "Cette photo ne s'ouvre pas ici. Essaie avec une autre."
  }
  return "Cette photo ne s'ouvre pas ici. Essaie avec une autre."
}
