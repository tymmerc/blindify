import Link from "next/link"
import { beautyProducts } from "@/data/beautyProducts"
import { evaluateTryOnEligibility } from "@/features/tryon/eligibility"

export default function BeautyCatalogPage() {
  return (
    <div className="min-h-screen px-6 py-10 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Démo try-on beauté</p>
            <h1 className="text-3xl font-bold">Catalogue produits</h1>
            <p className="text-sm text-white/70">
              Prototype AR/try-on (séparé de Blindify). Bouton “Voir en vrai” rendu uniquement pour les produits éligibles.
            </p>
          </div>
          <Link
            href="/analyse-visage"
            className="inline-flex w-fit rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
          >
            Accéder à l’analyse visage
          </Link>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {beautyProducts.map(product => {
            const eligibility = evaluateTryOnEligibility({
              id: product.id,
              brand: product.brand,
              name: product.name,
              category: product.category,
              tryOnType: product.tryOnType,
            })

            return (
              <Link
                key={product.id}
                href={`/produits/${product.slug}`}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-lg transition hover:border-white/25"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
                <img src={product.imageUrl} alt={product.name} className="h-64 w-full object-cover transition group-hover:scale-[1.02]" />
                <div className="relative space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/60">{product.brand}</p>
                    <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/70">
                      {eligibility.enabled ? "Try-on prêt" : "Try-on indisponible"}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold leading-tight">{product.name}</h2>
                  <p className="text-sm text-white/70">{product.description}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
