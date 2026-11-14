import Link from "next/link"

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center text-ink">
      <div className="text-center space-y-4 px-6">
        <p className="font-display text-6xl font-bold text-terra-txt">404</p>
        <h2 className="font-display text-xl font-semibold">Page introuvable</h2>
        <p className="text-sm text-ink-2">Cette page n'existe pas ou a été déplacée.</p>
        <Link
          href="/modes"
          className="inline-block rounded-md border-2 border-line bg-terra px-6 py-2 text-sm font-bold text-on-ink shadow-[4px_4px_0_rgb(var(--c-shadow))] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow))]"
        >
          Retour à l'accueil
        </Link>
      </div>
    </div>
  )
}
