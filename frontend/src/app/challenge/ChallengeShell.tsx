import type { ReactNode } from "react"
import Image from "next/image"
import { publicPath } from "@/lib/publicPath"

// Cadre des pages du defi. L'ami arrive ici par un lien recu dans une
// conversation, souvent sans connaitre le site : le logo dit ou il est.
// Sur telephone le contenu part du haut (avant : centre, avec un grand vide
// au-dessus) ; sur ordinateur il reste centre.
export function ChallengeShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col px-5 pb-10 pt-6 text-[#2e2014] sm:min-h-screen sm:items-center sm:justify-center sm:py-10">
      <div className={`mx-auto w-full ${wide ? "max-w-lg" : "max-w-md"}`}>
        <a href={publicPath("/")} className="mb-8 inline-flex items-center gap-2.5 sm:mb-10">
          <Image src={publicPath("/logo-mark.png")} alt="" width={40} height={40} className="h-9 w-9 object-contain sm:h-10 sm:w-10" />
          <span className="font-display text-xl font-semibold">blindz.app</span>
        </a>
        {children}
      </div>
    </div>
  )
}
