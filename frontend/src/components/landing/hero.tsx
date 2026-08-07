"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Play, ArrowRight } from "lucide-react";

const DISC_GROOVES =
  "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)";

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
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">
            Face A · Blindtest
          </p>
          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.05] text-[#2e2014]">
            Le{" "}
            <em className="font-medium italic text-[#c65133]">
              blindtest
            </em>
            <br />
            réinventé.
          </h1>
          <p className="text-base md:text-lg text-[#6b573f] max-w-xl mx-auto lg:mx-0 leading-relaxed">
            Joue avec tes playlists Spotify, seul ou entre amis, et découvre qui
            a vraiment l&apos;oreille musicale la plus affûtée.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <Link
              href="/modes"
              className="btn-neon text-sm"
            >
              <Play className="w-4 h-4" />
              Jouer maintenant
            </Link>
            <Link
              href="#how-it-works"
              className="btn-neon btn-neon-pink text-sm"
            >
              En savoir plus
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>

        {/* Vinyle qui tourne sur sa platine */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="flex-1 flex justify-center lg:justify-end"
        >
          <div className="relative w-[300px] md:w-[400px] lg:w-[460px] aspect-square">
            {/* Cercle de platine */}
            <div
              aria-hidden
              className="absolute inset-[-26px] rounded-full border-2 border-[rgba(46,32,20,.3)]"
            />
            {/* Disque : grooves espresso, tourne en continu */}
            <div
              aria-hidden
              className="absolute inset-0 rounded-full border-[3px] border-[#2e2014]"
              style={{
                background: DISC_GROOVES,
                animation: "vinyl-spin 7s linear infinite",
              }}
            >
              {/* Label terracotta */}
              <div
                className="absolute inset-[33%] rounded-full border-[3px] border-[#2e2014] bg-[#c65133]"
              />
              {/* Trou papier */}
              <div className="absolute inset-[48%] rounded-full border-2 border-[#2e2014] bg-[#f4ecdb]" />
            </div>
            {/* Bras de lecture */}
            <div aria-hidden className="absolute -top-[6%] -right-[2%] h-[36%] w-[36%] pointer-events-none">
              <div className="absolute top-0 right-[18px] h-[30px] w-[30px] rounded-full bg-[#2e2014]" />
              <div className="absolute top-[14px] right-[30px] h-[75%] w-[4px] origin-top rotate-[24deg] rounded-[2px] bg-[#2e2014]" />
              <div className="absolute -bottom-1 left-[34%] h-[30px] w-[18px] rotate-[24deg] rounded-[3px] border-2 border-[#2e2014] bg-[#c65133]" />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
