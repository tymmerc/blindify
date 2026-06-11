import Link from "next/link"

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center text-[#2e2014]">
      <div className="text-center space-y-4 px-6">
        <p className="font-display text-6xl font-bold text-[#c65133]">404</p>
        <h2 className="font-display text-xl font-semibold">Page introuvable</h2>
        <p className="text-sm text-[#6b573f]">Cette page n'existe pas ou a été déplacée.</p>
        <Link
          href="/modes"
          className="inline-block rounded-md border-2 border-[#2e2014] bg-[#c65133] px-6 py-2 text-sm font-bold text-[#f4ecdb] shadow-[4px_4px_0_#2e2014] transition hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014]"
        >
          Retour à l'accueil
        </Link>
      </div>
    </div>
  )
}
