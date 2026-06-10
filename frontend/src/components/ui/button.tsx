"use client"

import { ReactNode, ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"
import { Slot } from "@radix-ui/react-slot"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: "default" | "outline" | "ghost" | "link" | "glow"
  size?: "default" | "sm" | "lg" | "icon"
  asChild?: boolean
}

export function Button({
  children,
  variant = "default",
  size = "default",
  asChild = false,
  className,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button"

  const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
    default:
      "rounded-xl border border-white/[0.06] bg-[rgba(22,30,55,0.85)] text-[#fafafa] backdrop-blur-[16px] hover:border-white/[0.12] hover:bg-[rgba(22,30,55,0.95)]",
    outline:
      "rounded-xl border border-white/[0.08] bg-transparent text-[#fafafa] hover:border-white/[0.15] hover:bg-[rgba(22,30,55,0.5)]",
    ghost: "rounded-xl text-[#fafafa] hover:bg-[rgba(22,30,55,0.5)]",
    link: "rounded-none border-none bg-transparent text-[#a855f7] underline-offset-8 hover:underline",
    glow: "rounded-xl border border-[rgba(168,85,247,0.25)] bg-[rgba(168,85,247,0.12)] text-white hover:bg-[rgba(168,85,247,0.2)] hover:border-[rgba(168,85,247,0.4)] hover:shadow-glow",
  }

  const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
    default: "px-6 py-3 text-base",
    sm: "px-4 py-2 text-sm",
    lg: "px-9 py-4 text-lg",
    icon: "h-11 w-11",
  }

  return (
    <Comp
      className={cn(
        "relative inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a855f7]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  )
}
