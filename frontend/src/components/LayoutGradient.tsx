"use client"
import { ReactNode } from "react"
import { motion } from "framer-motion"

export default function LayoutGradient({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-br from-pink-50 via-purple-50 to-pink-100">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <motion.div
          className="absolute top-0 left-0 w-1/3 h-full bg-gradient-to-br from-purple-500 to-pink-500 blur-3xl"
          animate={{ opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 12, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-0 right-0 w-1/3 h-full bg-gradient-to-tl from-pink-500 to-purple-500 blur-3xl"
          animate={{ opacity: [0.12, 0.25, 0.12] }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.span className="absolute top-16 left-10 text-9xl text-purple-300/20">♪</motion.span>
        <motion.span className="absolute top-40 right-20 text-7xl text-pink-300/20">♫</motion.span>
        <motion.span className="absolute bottom-40 left-20 text-8xl text-purple-300/20">♬</motion.span>
        <motion.span className="absolute bottom-20 right-32 text-6xl text-pink-300/20">♩</motion.span>
      </div>

      <div className="relative z-10 flex flex-col flex-1">{children}</div>
    </div>
  )
}
