"use client"
import Link from "next/link"
import { motion } from "framer-motion"
import { usePathname } from "next/navigation"

export default function Navbar() {
  const pathname = usePathname()
  const nav = [
    { href: "/menu", label: "Accueil", icon: "🏠" },
    { href: "/stats", label: "Stats", icon: "📊" },
    { href: "/history", label: "Historique", icon: "📜" },
    { href: "/settings", label: "Settings", icon: "⚙️" },
  ]

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full fixed top-0 z-50 glass-strong"
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link
          href="/menu"
          className="flex items-center gap-3 group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xl group-hover:scale-110 transition-transform duration-300">
            🎵
          </div>
          <span className="text-2xl font-bold text-gradient">
            Blindify
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-2">
          {nav.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative group"
              >
                <div
                  className={`px-4 py-2 rounded-lg transition-all duration-300 ${
                    active
                      ? "text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <span className="text-lg">{item.icon}</span>
                    {item.label}
                  </span>
                </div>
                {active && (
                  <motion.div
                    layoutId="navbar-indicator"
                    className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-lg -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            )
          })}
        </div>

        <Link
          href="/menu"
          className="relative group overflow-hidden px-6 py-2.5 rounded-xl font-semibold text-white transition-all duration-300 hover-lift"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 group-hover:from-indigo-600 group-hover:to-purple-600 transition-all duration-300" />
          <span className="relative z-10">Menu</span>
        </Link>
      </div>

      {/* Mobile menu */}
      <div className="md:hidden flex items-center justify-around px-4 py-3 border-t border-white/10">
        {nav.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ${
                active ? "text-indigo-400" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </motion.nav>
  )
}