import { describe, expect, it } from "vitest"
import { beautyProducts } from "@/data/beautyProducts"
import { evaluateTryOnEligibility } from "./eligibility"
import { normalizeBrandName } from "@/config/partners/partnerBrands"

describe("brand normalization", () => {
  it("removes diacritics and lowercases brand names", () => {
    expect(normalizeBrandName(" Estée Lauder ")).toBe("estee lauder")
    expect(normalizeBrandName("AURORA LABS")).toBe("aurora labs")
  })
})

describe("try-on eligibility", () => {
  it("enables try-on for partner brand with assets", () => {
    const product = beautyProducts.find(p => p.id === "EL-ANR-001")
    expect(product).toBeDefined()
    const eligibility = evaluateTryOnEligibility({
      id: product!.id,
      brand: product!.brand,
      name: product!.name,
      category: product!.category,
      tryOnType: product!.tryOnType,
    })
    expect(eligibility.enabled).toBe(true)
    expect(eligibility.tryOnType).toBe("lips")
    expect(eligibility.shades && eligibility.shades.length).toBeGreaterThanOrEqual(3)
  })

  it("hides try-on for non-partner brand", () => {
    const product = beautyProducts.find(p => p.id === "ADS-SERUM-01")
    const eligibility = evaluateTryOnEligibility({
      id: product!.id,
      brand: product!.brand,
      name: product!.name,
      category: product!.category,
    })
    expect(eligibility.enabled).toBe(false)
    expect(eligibility.reason).toBe("BRAND_NOT_PARTNER")
  })

  it("blocks try-on when assets are missing even for partner brand", () => {
    const product = beautyProducts.find(p => p.id === "AL-LINER-001")
    const eligibility = evaluateTryOnEligibility({
      id: product!.id,
      brand: product!.brand,
      name: product!.name,
      category: product!.category,
      tryOnType: product!.tryOnType,
    })
    expect(eligibility.enabled).toBe(false)
    expect(eligibility.reason).toBe("MISSING_ASSETS")
  })
})
