"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Play, ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="relative max-w-7xl mx-auto px-6 py-12 lg:py-20">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
        {/* Texte à gauche */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="flex-1 text-center lg:text-left space-y-6"
        >
          <h1 className="text-5xl md:text-6xl font-bold leading-tight">
            Le{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              blindtest
            </span>{" "}
            réinventé.
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0">
            Joue avec tes playlists Spotify, seul ou entre amis, et découvre qui a vraiment l'oreille musicale la plus affûtée.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <Link
              href="/menu"
              className="px-6 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition"
            >
              <Play className="w-5 h-5" />
              Jouer maintenant
            </Link>
            <Link
              href="#how-it-works"
              className="px-6 py-3 rounded-full border border-border text-foreground font-medium flex items-center justify-center gap-2 hover:bg-background/50 transition"
            >
              En savoir plus
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>

        {/* Image à droite */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="flex-1 flex justify-center lg:justify-end"
        >
          <div className="relative w-[300px] md:w-[400px] lg:w-[460px] aspect-[9/16] rounded-3xl overflow-hidden shadow-xl border border-border">
            <Image
              src="/music-blindtest-game-interface-modern-dark.jpg"
              alt="Interface Blindify"
              fill
              className="object-cover"
              priority
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}