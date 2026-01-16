export type TryOnType = "lips" | "eyes" | "liner"

export type PartnerBrandConfig = {
  brandSlug: string
  displayName: string
  tryOnEnabled: boolean
  allowedTryOnTypes: TryOnType[]
}

/**
 * Normalize brand names so partner lookups are resilient to casing/accents.
 */
export function normalizeBrandName(brand: string): string {
  return brand
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

export const partnerBrands: PartnerBrandConfig[] = [
  {
    brandSlug: "estee lauder",
    displayName: "Estée Lauder",
    tryOnEnabled: true,
    allowedTryOnTypes: ["lips", "eyes"],
  },
  {
    brandSlug: "aurora labs",
    displayName: "Aurora Labs",
    tryOnEnabled: true,
    allowedTryOnTypes: ["liner", "eyes"],
  },
  {
    brandSlug: "atelier des sens",
    displayName: "Atelier des Sens",
    tryOnEnabled: false,
    allowedTryOnTypes: [],
  },
]
