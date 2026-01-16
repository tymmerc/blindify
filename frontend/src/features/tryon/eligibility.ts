import { normalizeBrandName, partnerBrands, type PartnerBrandConfig, type TryOnType } from "@/config/partners/partnerBrands"
import { tryOnCatalog, type TryOnCatalogEntry, type TryOnShade } from "@/config/partners/tryonCatalog"

export type TryOnEligibilityReason = "BRAND_NOT_PARTNER" | "PRODUCT_NOT_SUPPORTED" | "MISSING_ASSETS"

export type TryOnEligibility = {
  enabled: boolean
  reason?: TryOnEligibilityReason
  tryOnType?: TryOnType
  shades?: TryOnShade[]
}

export type ProductContext = {
  id: string
  brand: string
  name: string
  category?: string
  tryOnType?: TryOnType
}

const CATEGORY_TO_TRYON: Record<string, TryOnType> = {
  lipstick: "lips",
  lip: "lips",
  lips: "lips",
  lipgloss: "lips",
  gloss: "lips",
  eyeliner: "liner",
  liner: "liner",
  khol: "liner",
  eyeshadow: "eyes",
  mascara: "eyes",
  eye: "eyes",
}

const DEFAULT_SHADES: Record<TryOnType, TryOnShade[]> = {
  lips: [
    { id: "velvet-berry", name: "Velvet Berry", hex: "#A02149" },
    { id: "sunset-peach", name: "Sunset Peach", hex: "#E07864" },
    { id: "soft-nude", name: "Soft Nude", hex: "#C2876A" },
  ],
  eyes: [
    { id: "moonlit-rose", name: "Moonlit Rose", hex: "#C37DB1" },
    { id: "graphite-smoke", name: "Graphite Smoke", hex: "#5A5F73" },
    { id: "emerald-haze", name: "Emerald Haze", hex: "#3F6B4F" },
  ],
  liner: [
    { id: "onyx", name: "Onyx", hex: "#0F1116" },
    { id: "espresso", name: "Espresso", hex: "#36241C" },
    { id: "night-sapphire", name: "Night Sapphire", hex: "#0F2D50" },
  ],
}

function findPartner(brand: string): PartnerBrandConfig | undefined {
  const normalized = normalizeBrandName(brand)
  return partnerBrands.find(entry => entry.brandSlug === normalized)
}

function inferTryOnType(product: ProductContext): TryOnType | undefined {
  if (product.tryOnType) return product.tryOnType
  const key = product.category?.toLowerCase().trim() ?? ""
  return CATEGORY_TO_TRYON[key]
}

function getCatalogEntry(productId: string): TryOnCatalogEntry | undefined {
  return tryOnCatalog[productId]
}

export function evaluateTryOnEligibility(product: ProductContext): TryOnEligibility {
  const catalogEntry = getCatalogEntry(product.id)
  const partner = findPartner(product.brand)
  const normalizedBrand = normalizeBrandName(product.brand)

  if (!partner && !catalogEntry?.forceEnabled) {
    return { enabled: false, reason: "BRAND_NOT_PARTNER" }
  }

  if (partner && !partner.tryOnEnabled && !catalogEntry?.forceEnabled) {
    return { enabled: false, reason: "BRAND_NOT_PARTNER" }
  }

  const tryOnType = catalogEntry?.tryOnType ?? inferTryOnType(product)
  const partnerAllows = partner ? partner.allowedTryOnTypes.includes(tryOnType as TryOnType) : true

  if (!tryOnType || (!partnerAllows && !catalogEntry?.forceEnabled)) {
    return { enabled: false, reason: "PRODUCT_NOT_SUPPORTED", tryOnType }
  }

  const shades = (catalogEntry?.shades?.length ? catalogEntry.shades : DEFAULT_SHADES[tryOnType]) ?? []
  const assetsReady = catalogEntry?.assetsReady ?? true
  const hasAssets = assetsReady && shades.length > 0

  if (!hasAssets) {
    return { enabled: false, reason: "MISSING_ASSETS", tryOnType }
  }

  const brandOk = partner?.brandSlug === normalizedBrand || !!catalogEntry?.forceEnabled
  const enabled = brandOk && hasAssets && (partnerAllows || !!catalogEntry?.forceEnabled)

  if (!enabled) {
    return { enabled: false, reason: "PRODUCT_NOT_SUPPORTED", tryOnType, shades }
  }

  return { enabled: true, tryOnType, shades }
}
