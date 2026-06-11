import { Logo } from "@/components/Logo"
import Link from "next/link"

export function Navigation() {
  return (
    <nav className="fixed top-0 w-full bg-[rgba(244,236,219,0.92)] backdrop-blur-[8px] z-50 border-b-2 border-[#2e2014]">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Logo withText priority />

        <div className="hidden md:flex items-center gap-8">
          <Link
            href="#features"
            className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#6b573f] hover:text-[#c65133] transition-colors"
          >
            Fonctionnalites
          </Link>
          <Link
            href="#how-it-works"
            className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#6b573f] hover:text-[#c65133] transition-colors"
          >
            Comment ca marche
          </Link>
          <Link
            href="#pricing"
            className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#6b573f] hover:text-[#c65133] transition-colors"
          >
            Tarifs
          </Link>
        </div>

        <Link href="/modes" className="btn-neon text-xs">
          Jouer
        </Link>
      </div>
    </nav>
  )
}
