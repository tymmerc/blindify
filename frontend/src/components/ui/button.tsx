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
      "rounded-md border-2 border-line bg-terra text-on-ink font-bold shadow-[4px_4px_0_rgb(var(--c-shadow))] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow))] hover:bg-[#b8492d]",
    outline:
      "rounded-md border-2 border-line bg-transparent text-ink hover:bg-[rgb(var(--c-ink-block)/0.07)]",
    ghost: "rounded-md text-ink hover:bg-[rgb(var(--c-ink-block)/0.07)]",
    link: "rounded-none border-none bg-transparent text-terra-txt underline-offset-8 hover:underline",
    glow: "rounded-md border-2 border-line bg-ink-block text-on-ink font-bold shadow-[4px_4px_0_rgb(var(--c-shadow)/0.3)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--c-shadow)/0.3)] hover:bg-ink-block-hover",
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
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
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
