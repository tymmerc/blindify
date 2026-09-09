"use client"

import Image from "next/image"
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion"
import { publicPath } from "@/lib/publicPath"

// Le disque du hero est PILOTE par le scroll : on descend, il tourne ; on
// remonte, il revient. Le bras de lecture se pose sur le sillon a mesure
// qu'on entre dans "comment ca marche". Aucune animation autonome : c'est le
// lecteur qui fait tourner le disque. Avec prefers-reduced-motion, tout est
// fige en position "bras pose".
const GROOVES =
  "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)"

export function ScrollVinyl() {
  const reduce = useReducedMotion()
  const { scrollY } = useScroll()
  const rotate = useTransform(scrollY, [0, 2400], [0, 720])
  const arm = useTransform(scrollY, [0, 420], [-14, 24])

  return (
    <div className="relative mx-auto aspect-square w-[250px] sm:w-[330px] lg:w-[440px]">
      {/* Plateau sauge (la boucle de la cle de sol du logo) : le hero prend
          de la couleur sans toucher a la lisibilite du texte. */}
      <div
        aria-hidden
        className="absolute inset-[-26px] rounded-full border-[3px] border-[#2e2014] bg-[#789084] shadow-[8px_8px_0_#2e2014]"
      />
      {/* Disque */}
      <motion.div
        aria-hidden
        style={{ background: GROOVES, rotate: reduce ? 0 : rotate }}
        className="absolute inset-0 rounded-full border-[3px] border-[#2e2014]"
      >
        {/* Etiquette : anneau vermillon, puis pastille creme portant le logo.
            Le creme est obligatoire, le B de la cle de sol est noir et
            disparaitrait sur le vermillon. Le logo remplace le trou central :
            il tourne avec le disque, comme une vraie etiquette. */}
        <div className="absolute inset-[33%] grid place-items-center rounded-full border-[3px] border-[#2e2014] bg-[#cc4830]">
          <div className="grid h-[68%] w-[68%] place-items-center rounded-full border-2 border-[#2e2014] bg-[#f4ecdb]">
            <Image
              src={publicPath("/logo-mark.png")}
              alt=""
              width={512}
              height={512}
              className="h-[78%] w-[78%] object-contain"
            />
          </div>
        </div>
      </motion.div>
      {/* Bras de lecture : pivot en haut a droite */}
      <div aria-hidden className="pointer-events-none absolute -right-[2%] -top-[6%] h-[36%] w-[36%]">
        <div className="absolute right-[18px] top-0 h-[30px] w-[30px] rounded-full bg-[#2e2014]" />
        <motion.div
          style={{ rotate: reduce ? 24 : arm }}
          className="absolute right-[30px] top-[14px] h-[78%] w-[4px] origin-top rounded-[2px] bg-[#2e2014]"
        >
          <div className="absolute -bottom-1 -left-[7px] h-[30px] w-[18px] rounded-[3px] border-2 border-[#2e2014] bg-[#d88418]" />
        </motion.div>
      </div>
    </div>
  )
}
