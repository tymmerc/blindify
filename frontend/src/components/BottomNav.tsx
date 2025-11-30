import Link from "next/link"

type NavActive = "menu" | "stats" | "profile"

export function BottomNav({ active }: { active: NavActive }) {
  return (
    <nav className="ma-nav-bottom">
      <div className="ma-nav-inner">
        <Link href="/menu" className={`ma-nav-item ${active === "menu" ? "active" : ""}`}>
          <span className="text-lg">○</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.4px]">Accueil</span>
        </Link>
        <Link href="/stats" className={`ma-nav-item ${active === "stats" ? "active" : ""}`}>
          <span className="text-lg">◆</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.4px]">Stats</span>
        </Link>
        <Link href="/profile" className={`ma-nav-item ${active === "profile" ? "active" : ""}`}>
          <span className="text-lg">◉</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.4px]">Profil</span>
        </Link>
      </div>
    </nav>
  )
}
