"use client"

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion"

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
        <div className="absolute inset-[33%] rounded-full border-[3px] border-[#2e2014] bg-[#cc4830]">
          {/* Au-dessus du trou, pas dessous : sinon le texte est mange par le trou */}
          <span className="absolute left-0 right-0 top-[19%] text-center font-mono text-[8px] font-bold lowercase tracking-[0.1em] text-[#f4ecdb]">
            blindz.app
          </span>
        </div>
        <div className="absolute inset-[48%] rounded-full border-2 border-[#2e2014] bg-[#f4ecdb]" />
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
