/**
 * Mode sombre (T30). Trois choix : "auto" (par defaut), "clair", "sombre".
 *
 * En auto, l'ordre est : le theme de Discord dans l'Activite (parametre
 * `theme` de l'adresse de lancement, garde pour la session car la navigation
 * interne le perd), sinon le reglage du telephone ou de l'ordi
 * (prefers-color-scheme). Un choix force est garde dans le navigateur.
 *
 * Le theme est pose par THEME_HEAD_SCRIPT dans le <head>, avant le premier
 * affichage : pas d'ecran creme qui clignote avant de passer en nuit.
 */

export type ThemeChoice = "auto" | "clair" | "sombre"
export type ResolvedTheme = "light" | "dark"

export const THEME_STORAGE_KEY = "blindz-theme"
export const DISCORD_THEME_KEY = "blindz-theme-discord"
export const THEME_EVENT = "blindz-theme"

const CHOIX: readonly ThemeChoice[] = ["auto", "clair", "sombre"]

export function lireChoix(valeur: string | null | undefined): ThemeChoice {
  return CHOIX.includes(valeur as ThemeChoice) ? (valeur as ThemeChoice) : "auto"
}

/** Discord envoie dark, darker, midnight, light... : tout sauf light est sombre. */
export function themeDiscord(valeur: string | null | undefined): ResolvedTheme | null {
  if (!valeur || !/^[a-z]{3,16}$/.test(valeur)) return null
  return valeur === "light" ? "light" : "dark"
}

export function resoudreTheme(choix: ThemeChoice, discord: ResolvedTheme | null, appareilSombre: boolean): ResolvedTheme {
  if (choix === "sombre") return "dark"
  if (choix === "clair") return "light"
  if (discord) return discord
  return appareilSombre ? "dark" : "light"
}

function stockage(type: "local" | "session"): Storage | null {
  try {
    return type === "local" ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function choixActuel(): ThemeChoice {
  if (typeof window === "undefined") return "auto"
  try {
    return lireChoix(stockage("local")?.getItem(THEME_STORAGE_KEY))
  } catch {
    return "auto"
  }
}

function discordActuel(): ResolvedTheme | null {
  try {
    return themeDiscord(stockage("session")?.getItem(DISCORD_THEME_KEY))
  } catch {
    return null
  }
}

function appareilSombre(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function themeActuel(): ResolvedTheme {
  if (typeof document === "undefined") return "light"
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"
}

/** Recalcule le theme et le pose sur <html>. */
export function appliquerTheme(): ResolvedTheme {
  const theme = resoudreTheme(choixActuel(), discordActuel(), appareilSombre())
  document.documentElement.setAttribute("data-theme", theme)
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }))
  return theme
}

export function changerChoix(choix: ThemeChoice): ResolvedTheme {
  try {
    const s = stockage("local")
    if (choix === "auto") s?.removeItem(THEME_STORAGE_KEY)
    else s?.setItem(THEME_STORAGE_KEY, choix)
  } catch {
    // Navigation privee ou stockage bloque : le choix vaut pour cette page.
  }
  return appliquerTheme()
}

/**
 * Meme logique que resoudreTheme, en script autonome pour le <head> (aucun
 * import possible avant l'hydratation). theme.test.ts verifie qu'ils
 * s'accordent. Ne touche qu'a data-theme et au stockage de session.
 */
export const THEME_HEAD_SCRIPT = `(function(){
  var d = document.documentElement, c = null, q = null, s = null;
  try { c = localStorage.getItem("${THEME_STORAGE_KEY}"); } catch (e) {}
  try {
    q = new URLSearchParams(location.search).get("theme");
    if (q && /^[a-z]{3,16}$/.test(q)) sessionStorage.setItem("${DISCORD_THEME_KEY}", q);
    s = sessionStorage.getItem("${DISCORD_THEME_KEY}");
  } catch (e) {}
  var sombre;
  if (c === "sombre") sombre = true;
  else if (c === "clair") sombre = false;
  else if (s && /^[a-z]{3,16}$/.test(s)) sombre = s !== "light";
  else sombre = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  d.setAttribute("data-theme", sombre ? "dark" : "light");
})();`
