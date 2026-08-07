import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t-2 border-[#2e2014] py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 mb-8 max-w-md">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558] mb-4">
              Le jeu
            </h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/modes" className="text-[#6b573f] hover:text-[#c65133] transition-colors">Jouer</Link></li>
              <li><Link href="/solo" className="text-[#6b573f] hover:text-[#c65133] transition-colors">Solo</Link></li>
              <li><Link href="/leaderboard" className="text-[#6b573f] hover:text-[#c65133] transition-colors">Classement</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558] mb-4">
              Mon compte
            </h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/profile" className="text-[#6b573f] hover:text-[#c65133] transition-colors">Profil</Link></li>
              <li><Link href="/stats" className="text-[#6b573f] hover:text-[#c65133] transition-colors">Stats</Link></li>
              <li><Link href="/settings" className="text-[#6b573f] hover:text-[#c65133] transition-colors">Réglages</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[rgba(46,32,20,.22)] pt-8 flex flex-col md:flex-row justify-between items-center text-sm text-[#6b573f]">
          <p>&copy; 2025 Blindz. Tous droits réservés.</p>
          <p className="mt-2 md:mt-0">
            Made with <span className="text-[#c65133]">&#9834;</span> for music
            lovers
          </p>
        </div>
      </div>
    </footer>
  )
}
