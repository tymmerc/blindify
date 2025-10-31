"use client"

import { motion } from "framer-motion"

export default function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="section-header text-center md:text-left"
    >
      <h2 className="text-3xl md:text-4xl bg-gradient-to-r from-brand-cyan to-brand-purple bg-clip-text text-transparent font-extrabold">
        {title}
      </h2>
      {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
    </motion.header>
  )
}
