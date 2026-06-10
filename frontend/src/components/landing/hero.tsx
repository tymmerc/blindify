"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Play, ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="relative max-w-7xl mx-auto px-6 py-12 lg:py-20 overflow-hidden">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
        {/* Texte */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="flex-1 text-center lg:text-left space-y-6"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#00f7ff] text-glow-cyan">
            [ Player 1 Ready ]
          </p>
          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl uppercase tracking-[0.04em] leading-[1.05] text-[#f8f0ff]">
            Le{" "}
            <span className="text-glow-pink">
              blindtest
            </span>
            <br />
            <span className="text-glow-cyan">reinvente.</span>
          </h1>
          <p className="text-base md:text-lg text-[#9b7fb8] max-w-xl mx-auto lg:mx-0 leading-relaxed">
            Joue avec tes playlists Spotify, seul ou entre amis, et decouvre qui
            a vraiment l&apos;oreille musicale la plus affutee.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <Link
              href="/modes"
              className="btn-neon-pink font-display text-sm"
            >
              <Play className="w-4 h-4" />
              Jouer maintenant
            </Link>
            <Link
              href="#how-it-works"
              className="btn-neon font-display text-sm"
            >
              En savoir plus
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>

        {/* Decorative glow orb - synthwave sun */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="flex-1 flex justify-center lg:justify-end"
        >
          <div className="relative w-[300px] md:w-[400px] lg:w-[460px] aspect-square">
            {/* Outer pink halo */}
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,46,200,0.35)_0%,rgba(0,247,255,0.12)_45%,transparent_70%)]" />
            {/* Mid layer */}
            <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,46,200,0.45)_0%,rgba(168,85,247,0.18)_50%,transparent_80%)] blur-[2px]" />
            {/* Cyan core */}
            <div className="absolute inset-[28%] rounded-full bg-[radial-gradient(circle_at_40%_40%,rgba(0,247,255,0.45)_0%,rgba(255,46,200,0.18)_60%,transparent_100%)] blur-[6px]" />
            {/* Hot center */}
            <div className="absolute inset-[42%] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.4)_0%,rgba(255,234,0,0.25)_45%,transparent_100%)] blur-[4px]" />
            {/* Horizontal scanlines on the sun */}
            <div
              className="absolute inset-[14%] rounded-full pointer-events-none"
              style={{
                background:
                  "repeating-linear-gradient(to bottom, transparent 0, transparent 10px, rgba(10,0,20,0.6) 11px, transparent 14px)",
                mixBlendMode: "multiply",
              }}
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
