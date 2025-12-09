import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { publicPath } from "@/lib/publicPath"

type LogoProps = {
  withText?: boolean
  className?: string
  imageClassName?: string
  priority?: boolean
  href?: string
}

export function Logo({ withText = false, className, imageClassName, priority = false, href = "/" }: LogoProps) {
  const logoSrc = publicPath("/logo sans background.png")

  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-4 rounded-2xl px-1 py-1 transition hover:opacity-95",
        className,
      )}
      aria-label="Blindify"
    >
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#ff3d81] via-[#8f5bff] to-[#2dd4ff] blur-[12px] opacity-70" />
        <div
          className={cn(
            // Keep the glow but let transparent logos show through
            "relative h-full w-full rounded-2xl bg-transparent shadow-[0_12px_28px_rgba(0,0,0,0.35)]",
            imageClassName,
          )}
        >
          <Image
            src={logoSrc}
            alt="Blindify"
            fill
            sizes="48px"
            priority={priority}
            className="object-contain"
          />
        </div>
      </div>
      {withText ? (
        <span
          className="text-xl font-semibold leading-none tracking-tight text-white bg-clip-text text-transparent"
          style={{ backgroundImage: "linear-gradient(120deg,#ffffff,#d6ccff,#8f5bff)" }}
        >
          Blindify
        </span>
      ) : null}
    </Link>
  )
}
