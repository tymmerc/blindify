"use client"

import { ReactNode, ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"
import { Slot } from "@radix-ui/react-slot"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: "default" | "outline" | "ghost" | "link"
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
      "btn-primary px-8 py-3 text-sm tracking-[0.3em] uppercase border border-white/20 before:!opacity-60 hover:before:!opacity-80",
    outline:
      "rounded-full border border-white/15 bg-white/5 text-slate-200 hover:border-white/35 hover:text-white",
    ghost: "rounded-full text-slate-200 hover:bg-white/10",
    link: "rounded-none border-none bg-transparent text-neon underline-offset-8 hover:underline",
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
        "relative inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a855f7] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50",
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
