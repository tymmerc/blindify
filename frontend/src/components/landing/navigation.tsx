import { Button } from "@/components/ui/button"
import { Logo } from "@/components/Logo"
import Link from "next/link"

export function Navigation() {
  return (
    <nav className="fixed top-0 w-full bg-background/80 backdrop-blur-md z-50 border-b border-border">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Logo withText priority />

        <div className="hidden md:flex items-center gap-8">
          <Link href="#features" className="text-sm font-medium hover:text-accent transition-colors">
            Fonctionnalités
          </Link>
          <Link href="#how-it-works" className="text-sm font-medium hover:text-accent transition-colors">
            Comment ça marche
          </Link>
          <Link href="#pricing" className="text-sm font-medium hover:text-accent transition-colors">
            Tarifs
          </Link>
        </div>

        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full" size="sm">
          Jouer maintenant
        </Button>
      </div>
    </nav>
  )
}
