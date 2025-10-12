"use client"
import Link from "next/link"
import { motion } from "framer-motion"
import { usePathname } from "next/navigation"

export default function Navbar() {
  const pathname = usePathname()
  const nav = [
    { href: "/menu", label: "Accueil" },
    { href: "/game", label: "Solo" },
    { href: "/lobby", label: "Multijoueur" },
    { href: "/stats", label: "Stats" },
    { href: "/history", label: "Historique" },
  ]

  return (
    <motion.nav
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full fixed top-0 z-20 backdrop-blur-md bg-white/70 border-b border-purple-200"
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          href="/menu"
          className="text-2xl font-extrabold bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 bg-clip-text text-transparent"
        >
          Blindify
        </Link>

        <div className="flex gap-7">
          {nav.map((i) => {
            const active = pathname === i.href
            return (
              <Link
                key={i.href}
                href={i.href}
                className={active ? "text-pink-600 font-semibold" : "text-gray-700 hover:text-purple-600 font-semibold"}
              >
                {i.label}
              </Link>
            )
          })}
        </div>

        <Link
          href="/profile"
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold shadow"
        >
          Profil
        </Link>
      </div>
    </motion.nav>
  )
}
