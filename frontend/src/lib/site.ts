// Le nom du site, une seule copie cote front (T23, 01/11/2026).
//
// Google choisit le nom affiche au-dessus d'un resultat (a cote du favicon)
// d'apres le WebSite de l'accueil (name + alternateName), le <title> et
// og:site_name. Ces trois-la doivent dire la meme chose : « Blindz ».
// Le domaine reste un nom alternatif, c'est ce que les gens tapent aussi.

import { CONTACT_EMAIL, DISCORD_SUPPORT_URL } from "./contact"

export const SITE_NAME = "Blindz"

export const SITE_URL = "https://blindz.app/"

/** Les autres facons d'ecrire le nom, pour le WebSite et la WebApplication. */
export const SITE_ALTERNATE_NAMES = ["blindz.app", "Blindz app", "blindz app"] as const

/** Profils publics reels de Blindz. N'y mettre que des adresses qui existent. */
export const SITE_SAME_AS = [DISCORD_SUPPORT_URL, "https://github.com/tymmerc/blindify"] as const

const ORGANIZATION_ID = `${SITE_URL}#organization`
const WEBSITE_ID = `${SITE_URL}#website`

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    alternateName: [...SITE_ALTERNATE_NAMES],
    url: SITE_URL,
    inLanguage: "fr",
    publisher: { "@id": ORGANIZATION_ID },
  }
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    alternateName: [...SITE_ALTERNATE_NAMES],
    url: SITE_URL,
    // 512 px, carre, sur fond creme : Google demande au moins 112 px.
    logo: `${SITE_URL}icon-512.png`,
    email: CONTACT_EMAIL,
    sameAs: [...SITE_SAME_AS],
  }
}
