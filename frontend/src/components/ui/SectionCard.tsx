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
        "p-6 rounded-md bg-[#ece1c8] border-[1.5px] border-[rgba(46,32,20,.22)] hover:border-[rgba(46,32,20,.55)] transition-all duration-300",
        className
      )}
    >
      {children}
    </div>
  )
}
