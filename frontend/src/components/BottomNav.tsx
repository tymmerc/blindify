import Link from "next/link"

type NavActive = "menu" | "history" | "stats" | "profile"

const navItems: { href: string; key: NavActive; icon: string; label: string }[] = [
  { href: "/modes", key: "menu", icon: "○", label: "Accueil" },
  { href: "/history", key: "history", icon: "▤", label: "Historique" },
  { href: "/stats", key: "stats", icon: "◆", label: "Stats" },
  { href: "/profile", key: "profile", icon: "◉", label: "Profil" },
]

export function BottomNav({ active }: { active: NavActive }) {
  return (
    <nav className="ma-nav-bottom">
      <div className="ma-nav-inner">
        {navItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`ma-nav-item ${active === item.key ? "active" : ""}`}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em]">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
