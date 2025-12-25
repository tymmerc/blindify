import { type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"

type SurfaceCardProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export function SurfaceCard({ children, className, style }: SurfaceCardProps) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-[#0c0c0c] p-6 text-white", className)} style={style}>
      {children}
    </div>
  )
}
