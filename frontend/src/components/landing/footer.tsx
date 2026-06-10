import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#71717a] mb-4">
              Produit
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/app"
                  className="text-[#71717a] hover:text-[#fafafa] transition-colors"
                >
                  Jouer
                </Link>
              </li>
              <li>
                <Link
                  href="/leaderboard"
                  className="text-[#71717a] hover:text-[#fafafa] transition-colors"
                >
                  Classement
                </Link>
              </li>
              <li>
                <Link
                  href="#pricing"
                  className="text-[#71717a] hover:text-[#fafafa] transition-colors"
                >
                  Tarifs
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#71717a] mb-4">
              Infos
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/about"
                  className="text-[#71717a] hover:text-[#fafafa] transition-colors"
                >
                  A propos
                </Link>
              </li>
              <li>
                <Link
                  href="/blog"
                  className="text-[#71717a] hover:text-[#fafafa] transition-colors"
                >
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  className="text-[#71717a] hover:text-[#fafafa] transition-colors"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#71717a] mb-4">
              Legal
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/terms"
                  className="text-[#71717a] hover:text-[#fafafa] transition-colors"
                >
                  Conditions
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-[#71717a] hover:text-[#fafafa] transition-colors"
                >
                  Confidentialite
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#71717a] mb-4">
              Reseaux
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#71717a] hover:text-[#fafafa] transition-colors"
                >
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="https://discord.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#71717a] hover:text-[#fafafa] transition-colors"
                >
                  Discord
                </a>
              </li>
              <li>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#71717a] hover:text-[#fafafa] transition-colors"
                >
                  Instagram
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-8 flex flex-col md:flex-row justify-between items-center text-sm text-[#71717a]">
          <p>&copy; 2025 Blindify. Tous droits reserves.</p>
          <p className="mt-2 md:mt-0">
            Made with <span className="text-[#a855f7]">&#9834;</span> for music
            lovers
          </p>
        </div>
      </div>
    </footer>
  )
}
