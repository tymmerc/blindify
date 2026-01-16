import { TryOnType } from "@/config/partners/partnerBrands"

export type BeautyProduct = {
  id: string
  slug: string
  brand: string
  name: string
  description: string
  price: number
  category: string
  tryOnType?: TryOnType
  imageUrl: string
  highlights: string[]
  heroTone: string
}

export const beautyProducts: BeautyProduct[] = [
  {
    id: "EL-ANR-001",
    slug: "advanced-night-lip-vinyl",
    brand: "Estée Lauder",
    name: "Advanced Night Lip Vinyl",
    description: "Un fini vinyle léger, infusé d’acide hyaluronique pour des lèvres lisses et lumineuses.",
    price: 52,
    category: "lipstick",
    tryOnType: "lips",
    imageUrl:
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80",
    highlights: ["Reflets vinyles longue tenue", "Sensation soin grâce à l’acide hyaluronique", "Couleurs modulables"],
    heroTone: "from-[#1e1030] via-[#2a113e] to-[#0b0616]",
  },
  {
    id: "AL-LINER-001",
    slug: "aurora-precise-liner",
    brand: "Aurora Labs",
    name: "Précision Liner Intense",
    description:
      "Un tracé ultra-fin pour allonger le regard, avec une pointe feutre qui glisse sans effort.",
    price: 29,
    category: "eyeliner",
    tryOnType: "liner",
    imageUrl:
      "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=1200&q=80",
    highlights: ["Pointe feutre 0.1mm", "Tenue 24h", "Résiste aux frottements"],
    heroTone: "from-[#0b1a1f] via-[#0c2330] to-[#05090f]",
  },
  {
    id: "ADS-SERUM-01",
    slug: "atelier-rose-serum",
    brand: "Atelier des Sens",
    name: "Sérum Rose Velours",
    description: "Un concentré d’éclat à la rose de Damas, pour une peau reposée et rebondie.",
    price: 68,
    category: "serum",
    imageUrl:
      "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=1200&q=80",
    highlights: ["Texture fluide, non collante", "Parfum floral discret", "Testé sous contrôle dermatologique"],
    heroTone: "from-[#1f0d15] via-[#30111e] to-[#0e050a]",
  },
]

export function getProductBySlug(slug: string): BeautyProduct | undefined {
  return beautyProducts.find(product => product.slug === slug)
}
