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
        "rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 text-[#2e2014]",
        "shadow-[4px_4px_0_rgba(46,32,20,.18)]",
        "transition-all duration-200",
        glow && "hover:border-[#c65133] hover:shadow-[4px_4px_0_#c65133]",
        className
      )}
      style={style}
    >
      {children}
    </div>
  )
}
