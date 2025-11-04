import { Button } from "@/components/ui/ActionButton"
import { Music } from "lucide-react"
import Link from "next/link"

export function Navigation() {
  return (
    <nav className="fixed top-0 w-full bg-background/80 backdrop-blur-md z-50 border-b border-border">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary via-accent to-primary rounded-lg flex items-center justify-center">
            <Music className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Blindify
          </span>
        </Link>

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
