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
        "rounded-md border-2 border-line bg-paper-deep p-6 text-ink",
        "shadow-[4px_4px_0_rgb(var(--c-shadow)/.18)]",
        "transition-all duration-200",
        glow && "hover:border-terra hover:shadow-[4px_4px_0_rgb(var(--c-terra))]",
        className
      )}
      style={style}
    >
      {children}
    </div>
  )
}
