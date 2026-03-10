"use client"

import { motion } from "framer-motion"

interface VinylDiscProps {
  size?: number
  spinning?: boolean
  accentColor?: string
  coverUrl?: string | null
  blurred?: boolean
}

export function VinylDisc({ size = 280, spinning = true, accentColor = "#ff4fa5", coverUrl, blurred = false }: VinylDiscProps) {
  const dimension = `${size}px`

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: dimension, height: dimension, maxWidth: "80vw", maxHeight: "80vw" }}
    >
      {/* Main vinyl disc */}
      <motion.div
        className="absolute inset-0 rounded-full border border-white/20 shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
        style={{
          backgroundImage:
            "radial-gradient(circle at center,#1b1324 0%,#0f0c14 55%,#05030a 100%), repeating-radial-gradient(circle at center,rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 8px)",
          backgroundBlendMode: "screen",
        }}
        animate={spinning ? { rotate: 360 } : {}}
        transition={spinning ? { repeat: Infinity, duration: 16, ease: "linear" } : {}}
      >
        {/* Grooves ring */}
        <div className="absolute inset-[14%] rounded-full border border-white/20 bg-[radial-gradient(circle_at_center,#0a070f_0%,#0f0a15_65%,#0a070f_100%)]">
          <div className="absolute inset-1 rounded-full border border-white/20 bg-[conic-gradient(from_45deg,rgba(255,255,255,0.1),rgba(255,255,255,0)_18%)] opacity-60" />
        </div>
        {/* Label / Cover */}
        {coverUrl ? (
          <div className="absolute inset-[22%] overflow-hidden rounded-full border-2 border-white/20 shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="" className="h-full w-full object-cover transition-[filter] duration-700" style={{ filter: blurred ? "blur(4px) saturate(0.8)" : "none" }} />
            <div className="absolute inset-0 rounded-full shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]" />
            <div className="absolute inset-[42%] rounded-full bg-[#0b0710] border border-white/20" />
          </div>
        ) : (
          <>
            <div
              className="absolute inset-[32%] rounded-full border border-white/20"
              style={{ background: accentColor }}
            >
              <div className="absolute inset-1 rounded-full bg-[#100d17]" />
            </div>
            <div className="absolute inset-[46%] rounded-full bg-[#0b0710]" />
          </>
        )}
      </motion.div>

      {/* Glow effects */}
      <motion.div
        className="absolute h-[120%] w-[120%] rounded-full border"
        style={{ borderColor: `${accentColor}36` }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.12, 0.3] }}
        transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute h-[140%] w-[140%] rounded-full"
        style={{ background: `radial-gradient(circle, ${accentColor}28 0%, transparent 55%)` }}
        animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.2, 0.38, 0.2] }}
        transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
      />
    </div>
  )
}
