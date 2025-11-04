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
        "p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-purple-600 dark:hover:border-purple-600 transition-all shadow-sm hover:shadow-lg",
        className
      )}
    >
      {children}
    </div>
  )
}