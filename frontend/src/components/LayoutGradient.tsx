"use client"
import { ReactNode } from "react"
import { motion } from "framer-motion"

export default function LayoutGradient({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[#0f1419]">
      {/* Animated gradient background */}
      <div className="absolute inset-0 opacity-30">
        <motion.div
          className="absolute top-0 left-0 w-[600px] h-[600px] bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-transparent blur-3xl"
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-gradient-to-tl from-teal-500/20 via-cyan-500/20 to-transparent blur-3xl"
          animate={{
            x: [0, -100, 0],
            y: [0, -50, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-r from-purple-500/10 to-indigo-500/10 blur-3xl rounded-full"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Subtle grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}
      />

      {/* Floating music notes - more subtle and elegant */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-5">
        <motion.span
          className="absolute text-6xl"
          initial={{ top: "10%", left: "5%", opacity: 0 }}
          animate={{
            top: ["10%", "15%", "10%"],
            opacity: [0, 0.3, 0],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        >
          ♪
        </motion.span>
        <motion.span
          className="absolute text-5xl"
          initial={{ top: "60%", right: "10%", opacity: 0 }}
          animate={{
            top: ["60%", "55%", "60%"],
            opacity: [0, 0.3, 0],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        >
          ♫
        </motion.span>
        <motion.span
          className="absolute text-7xl"
          initial={{ bottom: "20%", left: "15%", opacity: 0 }}
          animate={{
            bottom: ["20%", "25%", "20%"],
            opacity: [0, 0.3, 0],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        >
          ♬
        </motion.span>
      </div>

      <div className="relative z-10 flex flex-col flex-1">{children}</div>
    </div>
  )
}