"use client";

import { Music, Play } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function Navbar() {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="fixed top-0 left-0 w-full z-50 bg-background/80 backdrop-blur-xl border-b border-border shadow-sm"
    >
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo + nom */}
        <Link href="/" className="flex items-center gap-2 text-foreground hover:opacity-80 transition">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
            <Music className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">Blindify</span>
        </Link>

        {/* Bouton menu */}
        <Link
          href="/menu"
          className="flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold hover:opacity-90 transition"
        >
          <Play className="w-4 h-4" />
          Menu
        </Link>
      </div>
    </motion.nav>
  );
}
