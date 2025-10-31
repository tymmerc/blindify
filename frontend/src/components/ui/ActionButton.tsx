"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"

export default function ActionButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ scale: 1.03 }}
      transition={{ type: "spring", stiffness: 200 }}
      onClick={onClick}
      className="btn-glow"
    >
      {children}
    </motion.button>
  )
}
