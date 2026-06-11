import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t-2 border-[#2e2014] py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558] mb-4">
              Produit
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/app"
                  className="text-[#6b573f] hover:text-[#c65133] transition-colors"
                >
                  Jouer
                </Link>
              </li>
              <li>
                <Link
                  href="/leaderboard"
                  className="text-[#6b573f] hover:text-[#c65133] transition-colors"
                >
                  Classement
                </Link>
              </li>
              <li>
                <Link
                  href="#pricing"
                  className="text-[#6b573f] hover:text-[#c65133] transition-colors"
                >
                  Tarifs
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558] mb-4">
              Infos
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/about"
                  className="text-[#6b573f] hover:text-[#c65133] transition-colors"
                >
                  A propos
                </Link>
              </li>
              <li>
                <Link
                  href="/blog"
                  className="text-[#6b573f] hover:text-[#c65133] transition-colors"
                >
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  className="text-[#6b573f] hover:text-[#c65133] transition-colors"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558] mb-4">
              Legal
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/terms"
                  className="text-[#6b573f] hover:text-[#c65133] transition-colors"
                >
                  Conditions
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-[#6b573f] hover:text-[#c65133] transition-colors"
                >
                  Confidentialite
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558] mb-4">
              Reseaux
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#6b573f] hover:text-[#c65133] transition-colors"
                >
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="https://discord.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#6b573f] hover:text-[#c65133] transition-colors"
                >
                  Discord
                </a>
              </li>
              <li>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#6b573f] hover:text-[#c65133] transition-colors"
                >
                  Instagram
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[rgba(46,32,20,.22)] pt-8 flex flex-col md:flex-row justify-between items-center text-sm text-[#6b573f]">
          <p>&copy; 2025 Blindify. Tous droits reserves.</p>
          <p className="mt-2 md:mt-0">
            Made with <span className="text-[#c65133]">&#9834;</span> for music
            lovers
          </p>
        </div>
      </div>
    </footer>
  )
}
