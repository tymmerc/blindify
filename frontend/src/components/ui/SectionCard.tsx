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
        "p-6 rounded-md bg-paper-deep border-[1.5px] border-[rgb(var(--c-line)/.22)] hover:border-[rgb(var(--c-line)/.55)] transition-all duration-300",
        className
      )}
    >
      {children}
    </div>
  )
}
