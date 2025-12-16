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
        "group inline-flex items-center gap-3 rounded-2xl px-1 py-1 transition hover:opacity-95",
        className,
      )}
      aria-label="Blindify"
    >
      <div
        className={cn(
          "relative grid h-12 w-12 place-items-center rounded-xl border border-border bg-background/80 shadow-none",
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
      {withText ? (
        <span className="text-xl font-semibold leading-none tracking-tight text-white">Blindify</span>
      ) : null}
    </Link>
  )
}
