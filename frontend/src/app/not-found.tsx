import Link from "next/link"

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#050505] text-white">
      <div className="text-center space-y-4 px-6">
        <p className="text-6xl font-bold text-purple-400">404</p>
        <h2 className="text-xl font-semibold">Page introuvable</h2>
        <p className="text-sm text-white/50">Cette page n'existe pas ou a été déplacée.</p>
        <Link href="/modes" className="inline-block rounded-xl bg-purple-500/20 border border-purple-500/30 px-6 py-2 text-sm font-medium text-purple-300 transition hover:bg-purple-500/30">
          Retour à l'accueil
        </Link>
      </div>
    </div>
  )
}
