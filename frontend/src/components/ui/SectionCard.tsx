"use client"

import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SectionCardProps {
  children: ReactNode
  className?: string
}

export default function SectionCard({ children, className }: SectionCardProps) {
  return (
    <div
      className={cn(
        "p-6 rounded-2xl bg-[rgba(22,30,55,0.45)] backdrop-blur-[16px] border border-white/[0.08] hover:border-white/[0.15] transition-all duration-300",
        className
      )}
    >
      {children}
    </div>
  )
}
