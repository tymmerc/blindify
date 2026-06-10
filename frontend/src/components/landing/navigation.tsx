import { Button } from "@/components/ui/button"
import { Logo } from "@/components/Logo"
import Link from "next/link"

export function Navigation() {
  return (
    <nav className="fixed top-0 w-full bg-[rgba(10,0,20,0.7)] backdrop-blur-[20px] z-50 border-b border-[#ff2ec8]/20">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Logo withText priority />

        <div className="hidden md:flex items-center gap-8">
          <Link
            href="#features"
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#9b7fb8] hover:text-[#00f7ff] hover:text-glow-cyan transition-colors"
          >
            Fonctionnalites
          </Link>
          <Link
            href="#how-it-works"
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#9b7fb8] hover:text-[#00f7ff] hover:text-glow-cyan transition-colors"
          >
            Comment ca marche
          </Link>
          <Link
            href="#pricing"
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#9b7fb8] hover:text-[#00f7ff] hover:text-glow-cyan transition-colors"
          >
            Tarifs
          </Link>
        </div>

        <Link href="/modes" className="btn-neon-pink font-display text-xs">
          Insert Coin
        </Link>
      </div>
    </nav>
  )
}
