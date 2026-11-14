"use client"

import { motion } from "framer-motion"

interface VinylDiscProps {
  size?: number
  spinning?: boolean
  accentColor?: string
  coverUrl?: string | null
  blurred?: boolean
}

const GROOVES = "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)"

export function VinylDisc({ size = 280, spinning = true, accentColor = "#c65133", coverUrl, blurred = false }: VinylDiscProps) {
  const dimension = `${size}px`

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: dimension, height: dimension, maxWidth: "80vw", maxHeight: "80vw" }}
    >
      {/* Disque : sillons espresso, esprit platine du Club analogique */}
      <motion.div
        className="absolute inset-0 rounded-full border-[3px] border-line"
        style={{ background: GROOVES }}
        animate={spinning ? { rotate: 360 } : {}}
        transition={spinning ? { repeat: Infinity, duration: 16, ease: "linear" } : {}}
      >
        {/* Label / Pochette */}
        {coverUrl ? (
          <div className="absolute inset-[24%] overflow-hidden rounded-full border-[3px] border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="Pochette d'album" className="h-full w-full object-cover transition-[filter] duration-700" style={{ filter: blurred ? "blur(4px) saturate(0.8)" : "none" }} />
            <div className="absolute inset-[44%] rounded-full border-2 border-line bg-paper" />
          </div>
        ) : (
          <>
            <div
              className="absolute inset-[32%] rounded-full border-[3px] border-line"
              style={{ background: accentColor }}
            />
            <div className="absolute inset-[46%] rounded-full border-2 border-line bg-paper" />
          </>
        )}
      </motion.div>

      {/* Cercle de platine autour du disque (trait fin, pas de glow) */}
      <div
        aria-hidden
        className="absolute h-[114%] w-[114%] rounded-full border-2"
        style={{ borderColor: "rgb(var(--c-line) / 0.3)" }}
      />
    </div>
  )
}
