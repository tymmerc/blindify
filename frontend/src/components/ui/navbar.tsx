"use client";

import { Play } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

import { Logo } from "@/components/Logo";

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
        <Logo withText priority className="hover:opacity-80" />

        {/* Bouton menu */}
        <Link
          href="/modes"
          className="flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold hover:opacity-90 transition"
        >
          <Play className="w-4 h-4" />
          Menu
        </Link>
      </div>
    </motion.nav>
  );
}
