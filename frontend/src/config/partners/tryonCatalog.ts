import { TryOnType } from "./partnerBrands"

export type TryOnShade = { id: string; name: string; hex: string }

export type TryOnCatalogEntry = {
  productId: string
  tryOnType: TryOnType
  shades?: TryOnShade[]
  /**
   * Demo escape hatch to enable try-on even when a partner is not fully wired.
   */
  forceEnabled?: boolean
  /**
   * Signal if assets/pipelines are ready. When false, we hide the button.
   */
  assetsReady?: boolean
  note?: string
}

export const tryOnCatalog: Record<string, TryOnCatalogEntry> = {
  "EL-ANR-001": {
    productId: "EL-ANR-001",
    tryOnType: "lips",
    shades: [
      { id: "midnight-rose", name: "Midnight Rose", hex: "#B60C47" },
      { id: "amber-glow", name: "Amber Glow", hex: "#D1645A" },
      { id: "plum-vibe", name: "Plum Vibe", hex: "#6C1B3B" },
    ],
    assetsReady: true,
  },
  "AL-LINER-001": {
    productId: "AL-LINER-001",
    tryOnType: "liner",
    shades: [],
    assetsReady: false,
    note: "Liner pipeline under calibration",
  },
}
