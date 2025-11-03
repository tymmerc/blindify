"use client"

import { motion } from "framer-motion"

export default function LayoutGradient({
  children,
}: {
  children?: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen flex flex-col">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2 }}
        className="absolute inset-0 -z-10 overflow-hidden"
      >
        {/* Dégradé principal */}
        <div className="absolute top-[-200px] right-[-150px] w-[600px] h-[600px] bg-gradient-to-br from-primary/30 to-accent/20 blur-[140px] rounded-full"></div>

        {/* Dégradé secondaire */}
        <div className="absolute bottom-[-200px] left-[-150px] w-[600px] h-[600px] bg-gradient-to-tr from-accent/25 to-primary/25 blur-[150px] rounded-full"></div>
      </motion.div>
      {children}
    </div>
  )
}
