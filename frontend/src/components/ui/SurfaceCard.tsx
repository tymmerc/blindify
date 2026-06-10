import { type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"

type SurfaceCardProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  glow?: boolean
}

export function SurfaceCard({ children, className, style, glow = false }: SurfaceCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.06] bg-[rgba(22,30,55,0.85)] p-6 text-[#fafafa]",
        "backdrop-blur-[16px] shadow-glass",
        "transition-all duration-200",
        "hover:border-white/[0.12]",
        glow && "hover:shadow-glow",
        className
      )}
      style={style}
    >
      {children}
    </div>
  )
}
