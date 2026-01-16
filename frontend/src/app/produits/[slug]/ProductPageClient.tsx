"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import type { BeautyProduct } from "@/data/beautyProducts"
import { TryOnModal } from "@/features/tryon/TryOnModal"
import { evaluateTryOnEligibility } from "@/features/tryon/eligibility"

type ProductPageClientProps = {
  product: BeautyProduct
}

export function ProductPageClient({ product }: ProductPageClientProps) {
  const eligibility = useMemo(
    () =>
      evaluateTryOnEligibility({
        id: product.id,
        brand: product.brand,
        name: product.name,
        category: product.category,
        tryOnType: product.tryOnType,
      }),
    [product]
  )
  const [showTryOn, setShowTryOn] = useState(false)

  const priceLabel = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(product.price)

  return (
    <div className="min-h-screen px-6 py-10 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex items-center justify-between">
          <Link href="/produits" className="text-sm text-white/60 transition hover:text-white">
            ← Retour catalogue beauté
          </Link>
          <Link
            href="/analyse-visage"
            className="text-sm text-white/70 underline-offset-4 transition hover:text-white hover:underline"
          >
            Analyse visage
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-[1.05fr_1.1fr]">
          <div className={`relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${product.heroTone}`}>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
            <div className="absolute left-4 top-4 rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-white/80">
              {product.brand}
            </div>
            {eligibility.enabled ? (
              <div className="absolute bottom-4 left-4 rounded-full bg-white/15 px-3 py-1 text-xs text-white/80">
                Try-on activé · {eligibility.tryOnType === "lips" ? "Lèvres" : eligibility.tryOnType === "liner" ? "Eye-liner" : "Yeux"}
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.25em] text-white/60">{product.brand}</p>
              <h1 className="text-3xl font-bold leading-tight md:text-4xl">{product.name}</h1>
              <p className="text-base text-white/70">{product.description}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl font-semibold text-white">{priceLabel}</span>
              <Button type="button" size="sm">
                Ajouter au panier
              </Button>
              {eligibility.enabled ? (
                <Button type="button" size="sm" onClick={() => setShowTryOn(true)}>
                  Voir en vrai
                </Button>
              ) : null}
            </div>

            <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
              <div className="flex items-center justify-between">
                <span>Programme partenaire</span>
                <span className="rounded-full border border-white/15 px-3 py-1 text-xs">
                  {eligibility.enabled ? "Éligible" : "Non éligible"}
                </span>
              </div>
              <p>
                Décision centralisée par le service d’éligibilité (brand + catalogue). Les selfies restent locaux et ne
                sont pas conservés.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <h2 className="text-sm uppercase tracking-[0.2em] text-white/50">Points clés</h2>
              <ul className="mt-3 space-y-2 text-sm text-white/75">
                {product.highlights.map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {showTryOn && eligibility.enabled ? (
        <TryOnModal
          productName={product.name}
          brand={product.brand}
          eligibility={eligibility}
          onClose={() => setShowTryOn(false)}
          heroImage={product.imageUrl}
        />
      ) : null}
    </div>
  )
}
